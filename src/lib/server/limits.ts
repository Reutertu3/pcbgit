/**
 * Per-user limits: how many boards a user may own, how much storage their boards
 * may take (repositories plus rendered output), how many uploads and pushes they
 * may make per hour, how many comments they may post per hour (each one notifies
 * the board's people, so a flood of them floods inboxes too), and how many renders
 * may wait or run at once for their boards: there is one render worker, and a push
 * of 200 commits would otherwise keep everyone else waiting for hours. Instance defaults are settings (`limit_*`), a user row
 * can override the first two, and admins have none.
 *
 * Storage and the render queue belong to the board's owner, so a collaborator's
 * push counts against the owner's limits; the hourly limit counts whoever uploads
 * or pushes.
 *
 * Above all of them, the server keeps a minimum of free disk space
 * (PCBGIT_MIN_FREE_DISK): a full disk would break the database and repositories
 * for everyone, so that one applies to admins too.
 */
import fsp from 'node:fs/promises';
import { UserError } from '../i18n';
import { parseByteSize } from './bytes';
import { all, count, get, getSetting, run } from './db';
import { repoExists, repoSize } from './git';
import { DATA_DIR, repoPath } from './paths';

export class LimitError extends UserError {}

export const DEFAULT_WRITES_PER_HOUR = 30;
export const DEFAULT_COMMENTS_PER_HOUR = 60;
export const DEFAULT_QUEUED_RENDERS = 10;
const MB = 1024 ** 2;
const HOUR = 60 * 60 * 1000;

interface LimitedUser {
	id: string;
	role: string;
	limit_boards: number | null;
	limit_storage_mb: number | null;
	limit_queued_renders: number | null;
}

export interface UserLimits {
	/** null: no limit. */
	boards: number | null;
	storageBytes: number | null;
	writesPerHour: number | null;
	commentsPerHour: number | null;
	queuedRenders: number | null;
}

/** The instance defaults; 0 means no limit. */
export function instanceLimits() {
	const read = (key: string, fallback: number) => Math.max(0, Math.floor(Number(getSetting(key, String(fallback))) || 0));
	return {
		boards: read('limit_boards', 0),
		storageMb: read('limit_storage_mb', 0),
		writesPerHour: read('limit_writes_per_hour', DEFAULT_WRITES_PER_HOUR),
		commentsPerHour: read('limit_comments_per_hour', DEFAULT_COMMENTS_PER_HOUR),
		queuedRenders: read('limit_queued_renders', DEFAULT_QUEUED_RENDERS)
	};
}

export function limitsFor(user: LimitedUser): UserLimits {
	if (user.role === 'admin') return { boards: null, storageBytes: null, writesPerHour: null, commentsPerHour: null, queuedRenders: null };
	const defaults = instanceLimits();
	const boards = user.limit_boards ?? defaults.boards;
	const storageMb = user.limit_storage_mb ?? defaults.storageMb;
	const queuedRenders = user.limit_queued_renders ?? defaults.queuedRenders;
	return {
		boards: boards > 0 ? boards : null,
		storageBytes: storageMb > 0 ? storageMb * MB : null,
		writesPerHour: defaults.writesPerHour > 0 ? defaults.writesPerHour : null,
		commentsPerHour: defaults.commentsPerHour > 0 ? defaults.commentsPerHour : null,
		queuedRenders: queuedRenders > 0 ? queuedRenders : null
	};
}

export function boardsOwned(userId: string) {
	return count('SELECT COUNT(*) FROM projects WHERE owner_id = ?', userId);
}

/**
 * Bytes the boards a user owns take: repositories plus rendered output.
 * syncCommits() keeps each repository's size current; boards from before that
 * (repo_bytes -1) are measured here once.
 */
export async function storageUsed(userId: string) {
	const unmeasured = all<{ id: string; slug: string; owner: string }>(
		`SELECT p.id, p.slug, u.username AS owner FROM projects p JOIN users u ON u.id = p.owner_id
		 WHERE p.owner_id = ? AND p.repo_bytes < 0`,
		userId
	);
	for (const project of unmeasured) {
		const size = repoExists(project.owner, project.slug) ? await repoSize(repoPath(project.owner, project.slug)) : 0;
		run('UPDATE projects SET repo_bytes = ? WHERE id = ?', size, project.id);
	}
	const repos = count('SELECT COALESCE(SUM(repo_bytes), 0) FROM projects WHERE owner_id = ?', userId);
	const artifacts = count(
		`SELECT COALESCE(SUM(a.size_bytes), 0) FROM artifacts a
		 JOIN commits c ON c.id = a.commit_id JOIN projects p ON p.id = c.project_id
		 WHERE p.owner_id = ?`,
		userId
	);
	return repos + artifacts;
}

/** For messages: whole MB, or GB with one decimal from 1 GB up. */
export const formatSize = (bytes: number) =>
	bytes >= 1024 * MB ? `${(bytes / (1024 * MB)).toFixed(1)} GB` : `${Math.round(bytes / MB)} MB`;

/** Free space the server always leaves on the data disk: PCBGIT_MIN_FREE_DISK, 1 GB if unset. */
export function minFreeDisk(value = process.env.PCBGIT_MIN_FREE_DISK) {
	const parsed = value?.trim() ? parseByteSize(value) : null;
	return parsed ?? 1024 ** 3;
}

export async function freeDiskSpace() {
	const stats = await fsp.statfs(DATA_DIR);
	return stats.bavail * stats.bsize;
}

/** Throws when writing `bytes` more would leave less than the minimum free. */
export async function checkDiskSpace(bytes = 0) {
	const free = await freeDiskSpace();
	const min = minFreeDisk();
	if (free - bytes < min) throw new LimitError('limits.error.disk', { free: formatSize(free), min: formatSize(min) });
}

function limitedUser(userId: string) {
	return get<LimitedUser>('SELECT id, role, limit_boards, limit_storage_mb, limit_queued_renders FROM users WHERE id = ?', userId);
}

/**
 * Before a board is written to: the disk's minimum free space, then the owner's
 * storage. The version that crosses the storage limit is still accepted; the next is not.
 */
export async function checkStorage(ownerId: string) {
	await checkDiskSpace();
	const owner = limitedUser(ownerId);
	const limit = owner && limitsFor(owner).storageBytes;
	if (!limit) return;
	const used = await storageUsed(ownerId);
	if (used >= limit) throw new LimitError('limits.error.storage', { used: formatSize(used), limit: formatSize(limit) });
}

/** Before a user creates a board. */
export async function checkNewBoard(ownerId: string) {
	const owner = limitedUser(ownerId);
	const limit = owner && limitsFor(owner).boards;
	if (limit && boardsOwned(ownerId) >= limit) throw new LimitError('limits.error.boards', { limit });
	await checkStorage(ownerId);
}

// Uploads and pushes, and comments, of the last hour per user, in memory like the
// sign-in limit: a restart forgets them, which only ever errs on the generous side.
const writes = new Map<string, number[]>();
const comments = new Map<string, number[]>();

function recentIn(log: Map<string, number[]>, userId: string, now: number) {
	const recent = (log.get(userId) ?? []).filter((at) => now - at < HOUR);
	log.set(userId, recent);
	return recent;
}

const recentWrites = (userId: string, now: number) => recentIn(writes, userId, now);

/** Minutes until the oldest counted event leaves the hour. */
const minutesLeft = (oldest: number, now: number) => Math.max(1, Math.ceil((HOUR - (now - oldest)) / 60_000));

/** Throws when the user has used up this hour's uploads and pushes. */
export function checkWriteRate(user: LimitedUser, now = Date.now()) {
	const limit = limitsFor(user).writesPerHour;
	if (!limit) return;
	const recent = recentWrites(user.id, now);
	if (recent.length >= limit) {
		throw new LimitError('limits.error.rate', { limit, count: minutesLeft(recent[0], now) });
	}
}

/** Counts an upload or push against the user's hourly limit, after checking it. */
export function takeWrite(user: LimitedUser, now = Date.now()) {
	checkWriteRate(user, now);
	if (limitsFor(user).writesPerHour) recentWrites(user.id, now).push(now);
}

/** Throws when the user has posted this hour's comments; checked before posting. */
export function checkCommentRate(user: LimitedUser, now = Date.now()) {
	const limit = limitsFor(user).commentsPerHour;
	if (!limit) return;
	const recent = recentIn(comments, user.id, now);
	if (recent.length >= limit) throw new LimitError('limits.error.comments', { limit, count: minutesLeft(recent[0], now) });
}

/** Counts a posted comment; a refused one (empty, too long) does not count. */
export function countComment(user: LimitedUser, now = Date.now()) {
	if (limitsFor(user).commentsPerHour) recentIn(comments, user.id, now).push(now);
}

/** Renders waiting or running for the boards a user owns. */
export function queuedRendersOf(ownerId: string) {
	return count(
		`SELECT COUNT(*) FROM render_jobs j JOIN projects p ON p.id = j.project_id
		 WHERE p.owner_id = ? AND j.status IN ('queued','running')`,
		ownerId
	);
}

/** How many more renders the owner's boards may queue now; Infinity without a limit. */
export function renderQueueRoom(ownerId: string) {
	const owner = limitedUser(ownerId);
	const limit = owner && limitsFor(owner).queuedRenders;
	return limit ? Math.max(0, limit - queuedRendersOf(ownerId)) : Infinity;
}

/**
 * Before someone queues a render by hand (History). An admin doing so is never
 * limited; the owner's limit applies to everyone else, collaborators included.
 */
export function checkRenderQueue(ownerId: string, actor: { role: string }) {
	if (actor.role === 'admin' || renderQueueRoom(ownerId) > 0) return;
	const owner = limitedUser(ownerId);
	throw new LimitError('limits.error.renderQueue', { limit: (owner && limitsFor(owner).queuedRenders) ?? 0 });
}

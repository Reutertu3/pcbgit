/**
 * Per-user limits: how many boards a user may own, how much storage their boards
 * may take (repositories plus rendered output), and how many uploads and pushes
 * they may make per hour. Instance defaults are settings (`limit_*`), a user row
 * can override the first two, and admins have none.
 *
 * Storage belongs to the board's owner, so a collaborator's push counts against
 * the owner's limit; the hourly limit counts whoever uploads or pushes.
 */
import { UserError } from '../i18n';
import { all, count, get, getSetting, run } from './db';
import { repoExists, repoSize } from './git';
import { repoPath } from './paths';

export class LimitError extends UserError {}

export const DEFAULT_WRITES_PER_HOUR = 30;
const MB = 1024 ** 2;
const HOUR = 60 * 60 * 1000;

interface LimitedUser {
	id: string;
	role: string;
	limit_boards: number | null;
	limit_storage_mb: number | null;
}

export interface UserLimits {
	/** null: no limit. */
	boards: number | null;
	storageBytes: number | null;
	writesPerHour: number | null;
}

/** The instance defaults; 0 means no limit. */
export function instanceLimits() {
	const read = (key: string, fallback: number) => Math.max(0, Math.floor(Number(getSetting(key, String(fallback))) || 0));
	return {
		boards: read('limit_boards', 0),
		storageMb: read('limit_storage_mb', 0),
		writesPerHour: read('limit_writes_per_hour', DEFAULT_WRITES_PER_HOUR)
	};
}

export function limitsFor(user: LimitedUser): UserLimits {
	if (user.role === 'admin') return { boards: null, storageBytes: null, writesPerHour: null };
	const defaults = instanceLimits();
	const boards = user.limit_boards ?? defaults.boards;
	const storageMb = user.limit_storage_mb ?? defaults.storageMb;
	return {
		boards: boards > 0 ? boards : null,
		storageBytes: storageMb > 0 ? storageMb * MB : null,
		writesPerHour: defaults.writesPerHour > 0 ? defaults.writesPerHour : null
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

export const formatMb = (bytes: number) => `${Math.round(bytes / MB)} MB`;

function limitedUser(userId: string) {
	return get<LimitedUser>('SELECT id, role, limit_boards, limit_storage_mb FROM users WHERE id = ?', userId);
}

/** Before a board is written to. The version that crosses the limit is still accepted; the next is not. */
export async function checkStorage(ownerId: string) {
	const owner = limitedUser(ownerId);
	const limit = owner && limitsFor(owner).storageBytes;
	if (!limit) return;
	const used = await storageUsed(ownerId);
	if (used >= limit) throw new LimitError('limits.error.storage', { used: formatMb(used), limit: formatMb(limit) });
}

/** Before a user creates a board. */
export async function checkNewBoard(ownerId: string) {
	const owner = limitedUser(ownerId);
	const limit = owner && limitsFor(owner).boards;
	if (limit && boardsOwned(ownerId) >= limit) throw new LimitError('limits.error.boards', { limit });
	await checkStorage(ownerId);
}

// Uploads and pushes of the last hour per user, in memory like the sign-in limit:
// a restart forgets them, which only ever errs on the generous side.
const writes = new Map<string, number[]>();

function recentWrites(userId: string, now: number) {
	const recent = (writes.get(userId) ?? []).filter((at) => now - at < HOUR);
	writes.set(userId, recent);
	return recent;
}

/** Throws when the user has used up this hour's uploads and pushes. */
export function checkWriteRate(user: LimitedUser, now = Date.now()) {
	const limit = limitsFor(user).writesPerHour;
	if (!limit) return;
	const recent = recentWrites(user.id, now);
	if (recent.length >= limit) {
		const minutes = Math.max(1, Math.ceil((HOUR - (now - recent[0])) / 60_000));
		throw new LimitError('limits.error.rate', { limit, count: minutes });
	}
}

/** Counts an upload or push against the user's hourly limit, after checking it. */
export function takeWrite(user: LimitedUser, now = Date.now()) {
	checkWriteRate(user, now);
	if (limitsFor(user).writesPerHour) recentWrites(user.id, now).push(now);
}

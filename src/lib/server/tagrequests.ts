/**
 * Tag requests: only admins create tags, so a missing one is asked for. Requests
 * for the same tag (by normalized name) collect everyone who asked; an approval
 * creates the tag, puts it on the boards it was asked for from, and tells them.
 */
import { UserError } from '../i18n';
import type { User } from './auth';
import { all, get, newId, now, run, tx } from './db';
import {
	FALLBACK_CATEGORY,
	canEdit,
	ensureTag,
	isTagCategory,
	isTagColor,
	listTags,
	slugify
} from './projects';
import { normalizeTagName, sameTag } from '../tagname';

export class TagRequestError extends UserError {}

/** Open requests one person may have at a time; admins create tags themselves. */
export const MAX_OPEN_REQUESTS = 5;
const MAX_NOTE = 300;

export interface TagRequestRow {
	id: string;
	name: string;
	category: string;
	note: string;
	status: 'open' | 'approved' | 'rejected';
	reason: string;
	created_at: number;
	decided_at: number | null;
}

/** An open request as the admin panel shows it: who asked, and for which boards. */
export interface OpenTagRequest extends TagRequestRow {
	people: { username: string; board: string | null }[];
}

/** A request as the person who asked sees it. */
export interface OwnTagRequest extends TagRequestRow {
	tag_slug: string | null;
	board: string | null;
}

function openRequestsOf(userId: string) {
	return get<{ n: number }>(
		`SELECT COUNT(*) AS n FROM tag_request_users ru JOIN tag_requests r ON r.id = ru.request_id
		 WHERE ru.user_id = ? AND r.status = 'open'`,
		userId
	)!.n;
}

function notifyAdmins(requestId: string, actorId: string) {
	for (const { id } of all<{ id: string }>("SELECT id FROM users WHERE role = 'admin' AND is_active = 1 AND id != ?", actorId)) {
		run(
			`INSERT INTO notifications (id, user_id, kind, actor_id, tag_request_id, created_at) VALUES (?,?,'tag_request',?,?,?)`,
			newId(),
			id,
			actorId,
			requestId,
			now()
		);
	}
}

/**
 * Asks for a tag. A tag that already exists under another spelling is refused
 * with its name; an open request for the same tag gains this person instead of
 * a second request. `project` is the board to tag on approval (must be editable).
 */
export function requestTag(opts: {
	user: User;
	name: string;
	category: string;
	note?: string;
	project?: { id: string; owner_id: string } | null;
}) {
	const name = opts.name.trim().replace(/\s+/g, ' ').slice(0, 40);
	const normalized = normalizeTagName(name);
	if (!normalized || !slugify(name)) throw new TagRequestError('tagRequest.error.name');
	if (!isTagCategory(opts.category)) throw new TagRequestError('tagRequest.error.category');
	const existing = sameTag(listTags(), name);
	if (existing) throw new TagRequestError('tagRequest.error.exists', { name: existing.name });
	const project = opts.project && canEdit(opts.project, opts.user) ? opts.project.id : null;

	const open = get<{ id: string; name: string }>("SELECT id, name FROM tag_requests WHERE normalized = ? AND status = 'open'", normalized);
	if (open) {
		if (get('SELECT 1 AS x FROM tag_request_users WHERE request_id = ? AND user_id = ?', open.id, opts.user.id)) {
			throw new TagRequestError('tagRequest.error.already', { name: open.name });
		}
	}
	if (opts.user.role !== 'admin' && openRequestsOf(opts.user.id) >= MAX_OPEN_REQUESTS) {
		throw new TagRequestError('tagRequest.error.limit', { max: MAX_OPEN_REQUESTS });
	}

	return tx(() => {
		if (open) {
			run('INSERT INTO tag_request_users (request_id, user_id, project_id, created_at) VALUES (?,?,?,?)', open.id, opts.user.id, project, now());
			return { id: open.id, name: open.name, joined: true };
		}
		const id = newId();
		run(
			'INSERT INTO tag_requests (id, name, normalized, category, note, created_at) VALUES (?,?,?,?,?,?)',
			id,
			name,
			normalized,
			opts.category,
			(opts.note ?? '').trim().slice(0, MAX_NOTE),
			now()
		);
		run('INSERT INTO tag_request_users (request_id, user_id, project_id, created_at) VALUES (?,?,?,?)', id, opts.user.id, project, now());
		notifyAdmins(id, opts.user.id);
		return { id, name, joined: false };
	});
}

// Oldest first; rowid breaks ties, since requests often share a millisecond.
export function listOpenTagRequests(): OpenTagRequest[] {
	const requests = all<TagRequestRow>("SELECT * FROM tag_requests WHERE status = 'open' ORDER BY created_at, rowid");
	return requests.map((request) => ({
		...request,
		people: all<{ username: string; board: string | null }>(
			`SELECT u.username, CASE WHEN p.id IS NULL THEN NULL ELSE o.username || '/' || p.slug END AS board
			 FROM tag_request_users ru JOIN users u ON u.id = ru.user_id
			 LEFT JOIN projects p ON p.id = ru.project_id LEFT JOIN users o ON o.id = p.owner_id
			 WHERE ru.request_id = ? ORDER BY ru.created_at, ru.rowid`,
			request.id
		)
	}));
}

export function listOwnTagRequests(userId: string, limit = 20): OwnTagRequest[] {
	return all<OwnTagRequest>(
		`SELECT r.*, t.slug AS tag_slug, CASE WHEN p.id IS NULL THEN NULL ELSE o.username || '/' || p.slug END AS board
		 FROM tag_request_users ru JOIN tag_requests r ON r.id = ru.request_id
		 LEFT JOIN tags t ON t.id = r.tag_id
		 LEFT JOIN projects p ON p.id = ru.project_id LEFT JOIN users o ON o.id = p.owner_id
		 WHERE ru.user_id = ? ORDER BY r.created_at DESC, r.rowid DESC LIMIT ?`,
		userId,
		limit
	);
}

/** Closes a request: tells everyone who asked, and marks the admins' notices read. */
function decide(requestId: string, admin: User, status: 'approved' | 'rejected', fields: { reason?: string; tagId?: string }) {
	run(
		'UPDATE tag_requests SET status = ?, reason = ?, tag_id = ?, decided_by = ?, decided_at = ? WHERE id = ?',
		status,
		(fields.reason ?? '').trim().slice(0, MAX_NOTE),
		fields.tagId ?? null,
		admin.id,
		now(),
		requestId
	);
	run("UPDATE notifications SET read_at = ? WHERE tag_request_id = ? AND kind = 'tag_request' AND read_at IS NULL", now(), requestId);
	for (const { user_id } of all<{ user_id: string }>('SELECT user_id FROM tag_request_users WHERE request_id = ?', requestId)) {
		if (user_id === admin.id) continue;
		run(
			`INSERT INTO notifications (id, user_id, kind, actor_id, tag_request_id, created_at) VALUES (?,?,'tag_decision',?,?,?)`,
			newId(),
			user_id,
			admin.id,
			requestId,
			now()
		);
	}
}

function openRequest(id: string) {
	const request = get<TagRequestRow>("SELECT * FROM tag_requests WHERE id = ? AND status = 'open'", id);
	if (!request) throw new TagRequestError('tagRequest.error.gone');
	return request;
}

/**
 * Creates the tag (name, category and colour as the admin settled them; an
 * existing tag of that name is reused) and adds it to the boards it was asked
 * for from, where the person who asked can still edit them.
 */
export function approveTagRequest(id: string, admin: User, fields: { name: string; category: string; color: string }) {
	const request = openRequest(id);
	const name = fields.name.trim().replace(/\s+/g, ' ').slice(0, 40) || request.name;
	if (!slugify(name)) throw new TagRequestError('tagRequest.error.name');
	const category = isTagCategory(fields.category) ? fields.category : FALLBACK_CATEGORY;
	const color = isTagColor(fields.color) ? fields.color : undefined;

	return tx(() => {
		const tagId = sameTag(listTags(), name)?.id ?? ensureTag(name, category, color)!;
		const boards = all<{ project_id: string; owner_id: string; user_id: string }>(
			`SELECT ru.project_id, p.owner_id, ru.user_id FROM tag_request_users ru JOIN projects p ON p.id = ru.project_id
			 WHERE ru.request_id = ?`,
			id
		);
		for (const board of boards) {
			const asker = get<User>('SELECT * FROM users WHERE id = ? AND is_active = 1', board.user_id);
			if (asker && canEdit({ id: board.project_id, owner_id: board.owner_id }, asker)) {
				run('INSERT OR IGNORE INTO project_tags (project_id, tag_id) VALUES (?,?)', board.project_id, tagId);
			}
		}
		decide(id, admin, 'approved', { tagId });
		return { name, tagged: boards.length };
	});
}

export function rejectTagRequest(id: string, admin: User, reason: string) {
	const request = openRequest(id);
	tx(() => decide(id, admin, 'rejected', { reason }));
	return { name: request.name };
}

import { all, get, newId, now, run, tx } from './db';
import type { CommentThread, CommentView } from '$lib/types';

export const MAX_COMMENT_LENGTH = 4000;

export class CommentError extends Error {}

interface Row {
	id: string;
	parent_id: string | null;
	body: string;
	created_at: number;
	deleted_at: number | null;
	user_id: string;
	username: string;
	display_name: string;
}

function toView(row: Row): CommentView {
	const deleted = row.deleted_at !== null;
	return {
		id: row.id,
		// Deleted placeholders keep their place in the thread but not their content.
		body: deleted ? '' : row.body,
		created_at: row.created_at,
		deleted,
		user_id: deleted ? '' : row.user_id,
		username: deleted ? '' : row.username,
		display_name: deleted ? '' : row.display_name
	};
}

/** Top-level comments, oldest first, each with its replies (one level deep). */
export function listThreads(projectId: string): CommentThread[] {
	const rows = all<Row>(
		`SELECT c.id, c.parent_id, c.body, c.created_at, c.deleted_at, c.user_id, u.username, u.display_name
		 FROM comments c JOIN users u ON u.id = c.user_id
		 WHERE c.project_id = ? ORDER BY c.created_at, c.rowid`,
		projectId
	);

	const threads = new Map<string, CommentThread>();
	for (const row of rows) {
		if (!row.parent_id) threads.set(row.id, { ...toView(row), replies: [] });
	}
	for (const row of rows) {
		if (row.parent_id) threads.get(row.parent_id)?.replies.push(toView(row));
	}
	// A placeholder whose replies are all gone has nothing left to show.
	return [...threads.values()].filter((thread) => !thread.deleted || thread.replies.length > 0);
}

export function countComments(projectId: string) {
	return Number(
		get<{ n: number }>('SELECT COUNT(*) AS n FROM comments WHERE project_id = ? AND deleted_at IS NULL', projectId)?.n ?? 0
	);
}

/**
 * Adds a comment, or a reply when `parentId` is given. Replies to a reply join
 * the same thread: the parent is resolved to its top-level comment.
 */
export function addComment(projectId: string, userId: string, body: string, parentId?: string | null) {
	const text = body.trim();
	if (!text) throw new CommentError('Write something first.');
	if (text.length > MAX_COMMENT_LENGTH) {
		throw new CommentError(`Comment is too long (${MAX_COMMENT_LENGTH} characters max).`);
	}

	let rootId: string | null = null;
	if (parentId) {
		const parent = get<{ id: string; parent_id: string | null }>(
			'SELECT id, parent_id FROM comments WHERE id = ? AND project_id = ?',
			parentId,
			projectId
		);
		if (!parent) throw new CommentError('The comment you replied to no longer exists.');
		rootId = parent.parent_id ?? parent.id;
	}

	const id = newId();
	run(
		'INSERT INTO comments (id, project_id, user_id, body, created_at, parent_id) VALUES (?,?,?,?,?,?)',
		id,
		projectId,
		userId,
		text,
		now(),
		rootId
	);
	return { id, threadId: rootId ?? id };
}

/**
 * Deletes a comment the actor may remove (its author, the board owner, an admin).
 * A top-level comment with replies becomes a placeholder so the thread still
 * reads; anything else is removed outright.
 */
export function removeComment(
	projectId: string,
	commentId: string,
	actor: { id: string; role: string },
	projectOwnerId: string
) {
	const comment = get<{ id: string; user_id: string; parent_id: string | null; deleted_at: number | null }>(
		'SELECT id, user_id, parent_id, deleted_at FROM comments WHERE id = ? AND project_id = ?',
		commentId,
		projectId
	);
	if (!comment || comment.deleted_at !== null) return false;

	const allowed = actor.role === 'admin' || actor.id === projectOwnerId || actor.id === comment.user_id;
	if (!allowed) throw new CommentError('You can only delete your own comments.');

	tx(() => {
		const replies = get<{ n: number }>('SELECT COUNT(*) AS n FROM comments WHERE parent_id = ?', comment.id)?.n ?? 0;
		if (!comment.parent_id && replies > 0) {
			run("UPDATE comments SET deleted_at = ?, body = '' WHERE id = ?", now(), comment.id);
			return;
		}
		run('DELETE FROM comments WHERE id = ?', comment.id);
		// Removing the last reply under a placeholder removes the placeholder too.
		if (comment.parent_id) {
			run(
				`DELETE FROM comments WHERE id = ? AND deleted_at IS NOT NULL
				 AND NOT EXISTS (SELECT 1 FROM comments r WHERE r.parent_id = ?)`,
				comment.parent_id,
				comment.parent_id
			);
		}
	});
	return true;
}

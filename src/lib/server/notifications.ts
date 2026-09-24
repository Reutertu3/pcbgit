import { all, get, newId, now, run } from './db';
import type { NotificationView } from '$lib/types';

/** The board's owner and collaborators: everyone who hears about activity on it. */
function boardPeople(projectId: string) {
	return all<{ user_id: string }>(
		`SELECT owner_id AS user_id FROM projects WHERE id = ?
		 UNION SELECT user_id FROM project_members WHERE project_id = ?`,
		projectId,
		projectId
	).map((r) => r.user_id);
}

/**
 * Notifies the board's owner and collaborators about a new comment, and the
 * author of the thread about a reply. The commenter is never notified about
 * their own comment, and one comment yields at most one notification per person.
 */
export function notifyForComment(opts: {
	commentId: string;
	projectId: string;
	actorId: string;
	threadAuthorId: string | null;
}) {
	const recipients = new Map<string, 'comment' | 'reply'>();
	if (opts.threadAuthorId) recipients.set(opts.threadAuthorId, 'reply');
	// A reply in someone's own thread keeps the "reply" kind set above, so the wording stays accurate.
	for (const userId of boardPeople(opts.projectId)) if (!recipients.has(userId)) recipients.set(userId, 'comment');
	recipients.delete(opts.actorId);

	for (const [userId, kind] of recipients) {
		run(
			`INSERT OR IGNORE INTO notifications (id, user_id, kind, project_id, comment_id, actor_id, created_at)
			 VALUES (?,?,?,?,?,?,?)`,
			newId(),
			userId,
			kind,
			opts.projectId,
			opts.commentId,
			opts.actorId,
			now()
		);
	}
}

/**
 * One notification per upload or push, however many commits it brought, pointing
 * at the newest. Goes to the owner and collaborators except whoever pushed.
 */
export function notifyForVersions(opts: { projectId: string; actorId: string; commitId: string; count: number }) {
	for (const userId of boardPeople(opts.projectId)) {
		if (userId === opts.actorId) continue;
		run(
			`INSERT INTO notifications (id, user_id, kind, project_id, commit_id, version_count, actor_id, created_at)
			 VALUES (?,?,'version',?,?,?,?,?)`,
			newId(),
			userId,
			opts.projectId,
			opts.commitId,
			opts.count,
			opts.actorId,
			now()
		);
	}
}

export function removeNotificationsFor(commentId: string) {
	run('DELETE FROM notifications WHERE comment_id = ?', commentId);
}

/**
 * Only boards the recipient can still see: a board turned private must not
 * leave dead links (or its comment text) in someone else's list.
 */
const VISIBLE = `(p.visibility = 'public' OR p.owner_id = n.user_id OR u_me.role = 'admin'
	OR EXISTS (SELECT 1 FROM project_members m WHERE m.project_id = p.id AND m.user_id = n.user_id))`;

/** A comment notification disappears with its comment, a version one with its commit. */
const SHOWN = `(CASE WHEN n.kind = 'version' THEN v.id IS NOT NULL ELSE c.deleted_at IS NULL END)`;

export function unreadCount(userId: string) {
	return Number(
		get<{ n: number }>(
			`SELECT COUNT(*) AS n FROM notifications n
			 JOIN projects p ON p.id = n.project_id
			 JOIN users u_me ON u_me.id = n.user_id
			 LEFT JOIN comments c ON c.id = n.comment_id
			 LEFT JOIN commits v ON v.id = n.commit_id
			 WHERE n.user_id = ? AND n.read_at IS NULL AND ${SHOWN} AND ${VISIBLE}`,
			userId
		)?.n ?? 0
	);
}

export function listNotifications(userId: string, limit = 30, offset = 0): NotificationView[] {
	return all<NotificationView>(
		`SELECT n.id, n.kind, n.created_at, n.read_at, n.comment_id, n.version_count,
		   COALESCE(a.username, 'someone') AS actor,
		   p.name AS project_name, p.slug AS project_slug, o.username AS project_owner,
		   CASE WHEN n.kind = 'version' THEN substr(v.message, 1, 140) ELSE substr(c.body, 1, 140) END AS excerpt,
		   substr(v.sha, 1, 7) AS short_sha
		 FROM notifications n
		 JOIN projects p ON p.id = n.project_id
		 JOIN users o ON o.id = p.owner_id
		 JOIN users u_me ON u_me.id = n.user_id
		 LEFT JOIN comments c ON c.id = n.comment_id
		 LEFT JOIN commits v ON v.id = n.commit_id
		 LEFT JOIN users a ON a.id = n.actor_id
		 WHERE n.user_id = ? AND ${SHOWN} AND ${VISIBLE}
		 ORDER BY n.created_at DESC, n.rowid DESC
		 LIMIT ? OFFSET ?`,
		userId,
		limit,
		offset
	);
}

export function notificationCount(userId: string) {
	return Number(
		get<{ n: number }>(
			`SELECT COUNT(*) AS n FROM notifications n
			 JOIN projects p ON p.id = n.project_id
			 JOIN users u_me ON u_me.id = n.user_id
			 LEFT JOIN comments c ON c.id = n.comment_id
			 LEFT JOIN commits v ON v.id = n.commit_id
			 WHERE n.user_id = ? AND ${SHOWN} AND ${VISIBLE}`,
			userId
		)?.n ?? 0
	);
}

export function markRead(userId: string, notificationId: string) {
	run('UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ? AND read_at IS NULL', now(), notificationId, userId);
}

export function markAllRead(userId: string) {
	return run('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL', now(), userId).changes;
}

import { all, get, newId, now, run } from './db';
import type { NotificationView } from '$lib/types';

/**
 * Notifies the board owner about a new comment, and the author of the thread
 * about a reply. The commenter is never notified about their own comment, and
 * one comment yields at most one notification per person.
 */
export function notifyForComment(opts: {
	commentId: string;
	projectId: string;
	actorId: string;
	threadAuthorId: string | null;
}) {
	const project = get<{ owner_id: string }>('SELECT owner_id FROM projects WHERE id = ?', opts.projectId);
	if (!project) return;

	const recipients = new Map<string, 'comment' | 'reply'>();
	if (opts.threadAuthorId) recipients.set(opts.threadAuthorId, 'reply');
	// The owner hears about everything on their board. A reply in their own
	// thread keeps the "reply" kind set above, so the wording stays accurate.
	if (!recipients.has(project.owner_id)) recipients.set(project.owner_id, 'comment');
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

export function removeNotificationsFor(commentId: string) {
	run('DELETE FROM notifications WHERE comment_id = ?', commentId);
}

/**
 * Only boards the recipient can still see: a board turned private must not
 * leave dead links (or its comment text) in someone else's list.
 */
const VISIBLE = `(p.visibility = 'public' OR p.owner_id = n.user_id OR u_me.role = 'admin')`;

export function unreadCount(userId: string) {
	return Number(
		get<{ n: number }>(
			`SELECT COUNT(*) AS n FROM notifications n
			 JOIN projects p ON p.id = n.project_id
			 JOIN users u_me ON u_me.id = n.user_id
			 WHERE n.user_id = ? AND n.read_at IS NULL AND ${VISIBLE}`,
			userId
		)?.n ?? 0
	);
}

export function listNotifications(userId: string, limit = 30): NotificationView[] {
	return all<NotificationView>(
		`SELECT n.id, n.kind, n.created_at, n.read_at, n.comment_id,
		   COALESCE(a.username, 'someone') AS actor,
		   p.name AS project_name, p.slug AS project_slug, o.username AS project_owner,
		   substr(c.body, 1, 140) AS excerpt
		 FROM notifications n
		 JOIN projects p ON p.id = n.project_id
		 JOIN users o ON o.id = p.owner_id
		 JOIN users u_me ON u_me.id = n.user_id
		 JOIN comments c ON c.id = n.comment_id
		 LEFT JOIN users a ON a.id = n.actor_id
		 WHERE n.user_id = ? AND c.deleted_at IS NULL AND ${VISIBLE}
		 ORDER BY n.created_at DESC, n.rowid DESC
		 LIMIT ?`,
		userId,
		limit
	);
}

export function markRead(userId: string, notificationId: string) {
	run('UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ? AND read_at IS NULL', now(), notificationId, userId);
}

export function markAllRead(userId: string) {
	return run('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL', now(), userId).changes;
}

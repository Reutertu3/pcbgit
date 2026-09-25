import type { NotificationView } from '$lib/types';

/** Where a notification leads: the comment, or the history for new versions. */
export function notificationHref(item: NotificationView) {
	if (item.kind === 'signup') return `/admin-panel/users?q=${encodeURIComponent(item.actor)}`;
	const board = `/${item.project_owner}/${item.project_slug}`;
	return item.kind === 'version' ? `${board}/history` : `${board}#comment-${item.comment_id}`;
}

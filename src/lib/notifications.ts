import type { NotificationView } from '$lib/types';

/** Where a notification leads: the comment, the history for new versions, a tag request's page. */
export function notificationHref(item: NotificationView) {
	if (item.kind === 'signup') return `/admin-panel/users?q=${encodeURIComponent(item.actor)}`;
	if (item.kind === 'tag_request') return '/admin-panel/tags#requests';
	if (item.kind === 'tag_decision') return '/tags/request';
	const board = `/${item.project_owner}/${item.project_slug}`;
	return item.kind === 'version' ? `${board}/history` : `${board}#comment-${item.comment_id}`;
}

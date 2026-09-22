import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listNotifications, markAllRead, markRead, unreadCount } from '$lib/server/notifications';

/** GET: the signed-in user's recent notifications, fetched when the bell opens. */
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) error(401, 'Sign in first');
	return json({ notifications: listNotifications(locals.user.id), unread: unreadCount(locals.user.id) });
};

/** POST { id } marks one as read; POST { all: true } marks all as read. */
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) error(401, 'Sign in first');
	const body = (await request.json().catch(() => ({}))) as { id?: string; all?: boolean };
	if (body.all) markAllRead(locals.user.id);
	else if (typeof body.id === 'string') markRead(locals.user.id, body.id);
	else error(400, 'Expected { id } or { all: true }');
	return json({ unread: unreadCount(locals.user.id) });
};

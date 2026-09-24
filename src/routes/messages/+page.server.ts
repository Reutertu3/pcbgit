import { fail, redirect } from '@sveltejs/kit';
import { translate } from '$lib/i18n';
import type { Actions, PageServerLoad } from './$types';
import { listNotifications, markAllRead, notificationCount } from '$lib/server/notifications';

const PER_PAGE = 25;

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) redirect(303, `/login?next=${encodeURIComponent(url.pathname)}`);
	const pageCount = Math.max(1, Math.ceil(notificationCount(locals.user.id) / PER_PAGE));
	const page = Math.min(pageCount, Math.max(1, Number(url.searchParams.get('page')) || 1));
	return {
		messages: listNotifications(locals.user.id, PER_PAGE, (page - 1) * PER_PAGE),
		page,
		pageCount
	};
};

export const actions: Actions = {
	markAllRead: async ({ locals }) => {
		if (!locals.user) return fail(401, { error: translate(locals.locale, 'error.signInFirst') });
		markAllRead(locals.user.id);
		return { success: true };
	}
};

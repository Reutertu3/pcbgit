import { fail, redirect } from '@sveltejs/kit';
import { translate } from '$lib/i18n';
import type { Actions, PageServerLoad } from './$types';
import { audit, get, now, run } from '$lib/server/db';
import { destroyUserSessions, hashPassword, verifyPassword } from '$lib/server/auth';
import { listNotifications, markAllRead, notificationCount } from '$lib/server/notifications';

const MESSAGES_PER_PAGE = 25;

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) redirect(303, `/login?next=${encodeURIComponent(url.pathname)}`);
	const total = notificationCount(locals.user.id);
	const pageCount = Math.max(1, Math.ceil(total / MESSAGES_PER_PAGE));
	const page = Math.min(pageCount, Math.max(1, Number(url.searchParams.get('page')) || 1));
	return {
		messages: listNotifications(locals.user.id, MESSAGES_PER_PAGE, (page - 1) * MESSAGES_PER_PAGE),
		messagePage: page,
		messagePageCount: pageCount,
		profile: {
			username: locals.user.username,
			email: locals.user.email,
			displayName: locals.user.display_name,
			bio: locals.user.bio
		}
	};
};

export const actions: Actions = {
	markAllRead: async ({ locals }) => {
		if (!locals.user) return fail(401, { error: translate(locals.locale, 'error.signInFirst') });
		markAllRead(locals.user.id);
		return { success: true };
	},

	profile: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: translate(locals.locale, 'error.signInFirst') });
		const form = await request.formData();
		const displayName = String(form.get('display_name') ?? '').trim().slice(0, 80);
		const bio = String(form.get('bio') ?? '').trim().slice(0, 300);
		const email = String(form.get('email') ?? '').trim();

		if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
			return fail(400, { error: translate(locals.locale, 'auth.error.email') });
		}
		if (get('SELECT 1 AS x FROM users WHERE email = ? AND id != ?', email, locals.user.id)) {
			return fail(409, { error: translate(locals.locale, 'account.error.emailInUse') });
		}

		run(
			'UPDATE users SET display_name = ?, bio = ?, email = ?, updated_at = ? WHERE id = ?',
			displayName || locals.user.username,
			bio,
			email,
			now(),
			locals.user.id
		);
		return { success: true, saved: true, message: translate(locals.locale, 'account.profileSaved') };
	},

	password: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: translate(locals.locale, 'error.signInFirst') });
		const form = await request.formData();
		const current = String(form.get('current') ?? '');
		const next = String(form.get('next') ?? '');

		if (!(await verifyPassword(current, locals.user.password_hash))) {
			return fail(401, { error: translate(locals.locale, 'account.error.currentPassword') });
		}
		if (next.length < 8) return fail(400, { error: translate(locals.locale, 'account.error.newPasswordShort') });

		run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', hashPassword(next), now(), locals.user.id);
		// Other devices should not keep a session opened with the old password.
		destroyUserSessions(locals.user.id);
		audit(locals.user.id, 'auth.password_change', locals.user.username);
		redirect(303, '/login?next=/settings');
	}
};

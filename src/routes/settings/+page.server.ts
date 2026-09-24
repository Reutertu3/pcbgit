import { fail, redirect } from '@sveltejs/kit';
import { translate } from '$lib/i18n';
import type { Actions, PageServerLoad } from './$types';
import { audit, get, now, run } from '$lib/server/db';
import { destroyUserSessions, hashPassword, verifyPassword } from '$lib/server/auth';
import { AvatarError, avatarVersion, removeAvatar, saveAvatar } from '$lib/server/avatars';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) redirect(303, `/login?next=${encodeURIComponent(url.pathname)}`);
	return {
		profile: {
			username: locals.user.username,
			email: locals.user.email,
			displayName: locals.user.display_name,
			avatar: avatarVersion(locals.user.id),
			bio: locals.user.bio
		}
	};
};

export const actions: Actions = {
	// `avatar` keeps the feedback next to the picture instead of at the top of the page.
	avatar: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: translate(locals.locale, 'error.signInFirst') });
		const file = (await request.formData()).get('picture');
		if (!(file instanceof File) || file.size === 0) {
			return fail(400, { avatar: true, error: translate(locals.locale, 'avatar.error.missing') });
		}
		try {
			await saveAvatar(locals.user.id, new Uint8Array(await file.arrayBuffer()));
		} catch (thrown) {
			if (thrown instanceof AvatarError) return fail(400, { avatar: true, error: thrown.in(locals.locale) });
			throw thrown;
		}
		return { avatar: true, success: true, message: translate(locals.locale, 'avatar.saved') };
	},

	removeAvatar: async ({ locals }) => {
		if (!locals.user) return fail(401, { error: translate(locals.locale, 'error.signInFirst') });
		removeAvatar(locals.user.id);
		return { avatar: true, success: true, message: translate(locals.locale, 'avatar.removed') };
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

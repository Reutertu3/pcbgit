import { fail, redirect } from '@sveltejs/kit';
import { translate } from '$lib/i18n';
import type { Actions, PageServerLoad } from './$types';
import { createSession, createUser, getUserByUsername, validateUsername } from '$lib/server/auth';
import { audit, count, get, getBoolSetting } from '$lib/server/db';
import { SESSION_COOKIE } from '../../hooks.server';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) redirect(303, '/');
	if (!getBoolSetting('registration_open', true)) {
		return { closed: true };
	}
	return { closed: false };
};

export const actions: Actions = {
	default: async ({ request, cookies, url, locals }) => {
		const form = await request.formData();
		const username = String(form.get('username') ?? '').trim();
		const email = String(form.get('email') ?? '').trim();
		const password = String(form.get('password') ?? '');
		const values = { username, email };

		if (!getBoolSetting('registration_open', true)) {
			return fail(403, { error: translate(locals.locale, 'auth.registrationClosedHint'), ...values });
		}

		const usernameError = validateUsername(username);
		if (usernameError) return fail(400, { error: translate(locals.locale, usernameError), ...values });
		if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
			return fail(400, { error: translate(locals.locale, 'auth.error.email'), ...values });
		}
		if (password.length < 8) {
			return fail(400, { error: translate(locals.locale, 'auth.error.passwordShort'), ...values });
		}
		if (getUserByUsername(username)) {
			return fail(409, { error: translate(locals.locale, 'auth.error.usernameTaken'), ...values });
		}
		if (get('SELECT 1 AS x FROM users WHERE email = ?', email)) {
			return fail(409, { error: translate(locals.locale, 'auth.error.emailTaken'), ...values });
		}

		// The very first account to register owns the instance.
		const isFirst = count('SELECT COUNT(*) FROM users') === 0;
		const user = createUser({ username, email, password, role: isFirst ? 'admin' : 'user' });
		audit(user.id, 'auth.register', username);

		const session = createSession(user.id, request.headers.get('user-agent') ?? '');
		cookies.set(SESSION_COOKIE, session.id, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: url.protocol === 'https:',
			expires: session.expiresAt
		});
		redirect(303, '/new');
	}
};

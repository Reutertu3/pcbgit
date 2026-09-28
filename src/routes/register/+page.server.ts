import { fail, redirect } from '@sveltejs/kit';
import { translate } from '$lib/i18n';
import type { Actions, PageServerLoad } from './$types';
import { createSession, createUser, getUserByUsername, hashPasswordAsync, validateUsername } from '$lib/server/auth';
import { recordRegistration, registrationRetryAfter } from '$lib/server/loginguard';
import { audit, count, get, getBoolSetting, run } from '$lib/server/db';
import { notifyForSignup } from '$lib/server/notifications';
import { SESSION_COOKIE } from '../../hooks.server';

/**
 * Accounts that may wait for approval at once. Beyond it registration pauses until
 * an admin catches up: bots spread over many addresses still cannot bury the
 * Users page or the admins' notifications.
 */
const MAX_PENDING = 50;

/**
 * A field people never see or reach (the form hides it and leaves it out of the
 * tab order); simple bots fill in every field they find. Named in +page.svelte too.
 */
const HONEYPOT = 'leave_empty';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) redirect(303, '/');
	if (!getBoolSetting('registration_open', true)) {
		return { closed: true, approval: false };
	}
	return { closed: false, approval: getBoolSetting('registration_approval', true) };
};

export const actions: Actions = {
	default: async ({ request, cookies, url, locals, getClientAddress }) => {
		const form = await request.formData();
		const username = String(form.get('username') ?? '').trim();
		const email = String(form.get('email') ?? '').trim();
		const password = String(form.get('password') ?? '');
		const values = { username, email };

		if (!getBoolSetting('registration_open', true)) {
			return fail(403, { error: translate(locals.locale, 'auth.registrationClosedHint'), ...values });
		}
		// A bot gets the answer a person waiting for approval gets, and no account,
		// so it learns nothing.
		if (String(form.get(HONEYPOT) ?? '')) return { pending: true, username };

		const address = getClientAddress();
		const wait = registrationRetryAfter(address);
		if (wait) {
			return fail(429, { error: translate(locals.locale, 'auth.error.registrationRate', { count: Math.ceil(wait / 60_000) }), ...values });
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

		// The very first account to register owns the instance, and nobody could approve it.
		const isFirst = count('SELECT COUNT(*) FROM users') === 0;
		const pending = !isFirst && getBoolSetting('registration_approval', true);
		if (pending && count('SELECT COUNT(*) FROM users WHERE approved = 0') >= MAX_PENDING) {
			return fail(503, { error: translate(locals.locale, 'auth.error.registrationPaused'), ...values });
		}
		const passwordHash = await hashPasswordAsync(password);
		const user = createUser({ username, email, passwordHash, role: isFirst ? 'admin' : 'user', pending });
		recordRegistration(address);
		audit(user.id, 'auth.register', username, pending ? 'awaiting approval' : '');
		if (isFirst) run('UPDATE users SET is_owner = 1 WHERE id = ?', user.id);
		else notifyForSignup(user.id);
		// No session: the account cannot sign in until an admin approves it.
		if (pending) return { pending: true, username };

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

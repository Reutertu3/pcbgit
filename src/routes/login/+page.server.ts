import { fail, redirect } from '@sveltejs/kit';
import { translate } from '$lib/i18n';
import type { Actions, PageServerLoad } from './$types';
import { createSession, findUserByLogin, verifyPassword } from '$lib/server/auth';
import { clearLoginFailures, loginRetryAfter, recordLoginFailure, safeNextPath } from '$lib/server/loginguard';
import { SESSION_COOKIE } from '../../hooks.server';
import { audit } from '$lib/server/db';

export const load: PageServerLoad = async ({ locals, url }) => {
	const next = safeNextPath(url.searchParams.get('next'));
	if (locals.user) redirect(303, next);
	return { next };
};

export const actions: Actions = {
	default: async ({ request, cookies, url, locals, getClientAddress }) => {
		const form = await request.formData();
		const login = String(form.get('login') ?? '').trim();
		const password = String(form.get('password') ?? '');
		const next = safeNextPath(String(form.get('next') ?? '/'));

		if (!login || !password) {
			return fail(400, { error: translate(locals.locale, 'auth.error.missing'), login });
		}

		const user = findUserByLogin(login);
		// Count by account, so username and email share one limit.
		const account = user?.id ?? login.toLowerCase();
		const ip = getClientAddress();

		// Checked before hashing: a blocked attempt costs no scrypt.
		const wait = loginRetryAfter(ip, account);
		if (wait) {
			return fail(429, { error: translate(locals.locale, 'auth.error.tooMany', { count: Math.ceil(wait / 60_000) }), login });
		}

		// One message for both cases, so this cannot be used to enumerate accounts.
		if (!user || !(await verifyPassword(password, user.password_hash))) {
			recordLoginFailure(ip, account);
			return fail(401, { error: translate(locals.locale, 'auth.error.incorrect'), login });
		}
		clearLoginFailures(account);
		if (!user.is_active) {
			return fail(403, { error: translate(locals.locale, user.approved ? 'auth.error.disabled' : 'auth.error.pending'), login });
		}

		const session = createSession(user.id, request.headers.get('user-agent') ?? '');
		cookies.set(SESSION_COOKIE, session.id, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: url.protocol === 'https:',
			expires: session.expiresAt
		});
		audit(user.id, 'auth.login', user.username);
		redirect(303, next);
	}
};

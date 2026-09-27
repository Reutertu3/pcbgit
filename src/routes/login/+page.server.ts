import { fail, redirect } from '@sveltejs/kit';
import { translate } from '$lib/i18n';
import type { Actions, PageServerLoad } from './$types';
import { createSession, findUserByLogin, verifyNoAccount, verifyPassword } from '$lib/server/auth';
import { clearLoginFailures, loginRetryAfter, recordLoginFailure, safeNextPath } from '$lib/server/loginguard';
import { SESSION_COOKIE } from '../../hooks.server';
import { audit } from '$lib/server/db';
import { CHALLENGE_COOKIE, CHALLENGE_TTL, createChallenge } from '$lib/server/twofactor';

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

		// One message and the same work for both cases, so neither the text nor the
		// response time tells whether the account exists.
		const valid = user ? await verifyPassword(password, user.password_hash) : await verifyNoAccount(password);
		if (!user || !valid) {
			recordLoginFailure(ip, account);
			return fail(401, { error: translate(locals.locale, 'auth.error.incorrect'), login });
		}
		if (!user.is_active) {
			clearLoginFailures(account);
			return fail(403, { error: translate(locals.locale, user.approved ? 'auth.error.disabled' : 'auth.error.pending'), login });
		}

		// The account's failure count is cleared only after the code, or someone with
		// the password could reset it between rounds of guessing codes.
		if (user.totp_secret) {
			cookies.set(CHALLENGE_COOKIE, createChallenge(user.id, next), {
				path: '/login',
				httpOnly: true,
				sameSite: 'lax',
				secure: url.protocol === 'https:',
				maxAge: CHALLENGE_TTL / 1000
			});
			redirect(303, '/login/2fa');
		}
		clearLoginFailures(account);

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

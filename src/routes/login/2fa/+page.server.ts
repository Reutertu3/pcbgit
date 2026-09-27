import { fail, redirect } from '@sveltejs/kit';
import { translate } from '$lib/i18n';
import type { Actions, PageServerLoad } from './$types';
import { createSession, getUserById } from '$lib/server/auth';
import { clearLoginFailures, loginRetryAfter, recordLoginFailure } from '$lib/server/loginguard';
import { CHALLENGE_COOKIE, endChallenge, failChallenge, getChallenge, verifySecondFactor } from '$lib/server/twofactor';
import { SESSION_COOKIE } from '../../../hooks.server';
import { audit } from '$lib/server/db';

export const load: PageServerLoad = async ({ locals, cookies }) => {
	if (locals.user) redirect(303, '/');
	// Only reachable right after the password: otherwise there is nothing to confirm.
	if (!getChallenge(cookies.get(CHALLENGE_COOKIE))) redirect(303, '/login');
	return {};
};

export const actions: Actions = {
	default: async ({ request, cookies, url, locals, getClientAddress }) => {
		const token = cookies.get(CHALLENGE_COOKIE) ?? '';
		const challenge = getChallenge(token);
		const user = challenge ? getUserById(challenge.userId) : undefined;
		if (!challenge || !user?.totp_secret || !user.is_active) {
			cookies.delete(CHALLENGE_COOKIE, { path: '/login' });
			return fail(400, { expired: true, error: translate(locals.locale, 'twofactor.error.expired') });
		}

		const ip = getClientAddress();
		const wait = loginRetryAfter(ip, user.id);
		if (wait) {
			return fail(429, { error: translate(locals.locale, 'auth.error.tooMany', { count: Math.ceil(wait / 60_000) }) });
		}

		const code = String((await request.formData()).get('code') ?? '');
		const method = verifySecondFactor(user, code);
		if (!method) {
			recordLoginFailure(ip, user.id);
			if (failChallenge(token)) return fail(401, { error: translate(locals.locale, 'twofactor.error.code') });
			cookies.delete(CHALLENGE_COOKIE, { path: '/login' });
			return fail(401, { expired: true, error: translate(locals.locale, 'twofactor.error.tooMany') });
		}

		endChallenge(token);
		cookies.delete(CHALLENGE_COOKIE, { path: '/login' });
		clearLoginFailures(user.id);
		const session = createSession(user.id, request.headers.get('user-agent') ?? '');
		cookies.set(SESSION_COOKIE, session.id, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: url.protocol === 'https:',
			expires: session.expiresAt
		});
		audit(user.id, 'auth.login', user.username, method === 'recovery' ? 'recovery code' : 'authenticator');
		redirect(303, challenge.next);
	}
};

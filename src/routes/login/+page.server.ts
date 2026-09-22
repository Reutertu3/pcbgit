import { fail, redirect } from '@sveltejs/kit';
import { translate } from '$lib/i18n';
import type { Actions, PageServerLoad } from './$types';
import { createSession, findUserByLogin, verifyPassword } from '$lib/server/auth';
import { SESSION_COOKIE } from '../../hooks.server';
import { audit } from '$lib/server/db';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (locals.user) redirect(303, url.searchParams.get('next') ?? '/');
	return { next: url.searchParams.get('next') ?? '/' };
};

export const actions: Actions = {
	default: async ({ request, cookies, url, locals }) => {
		const form = await request.formData();
		const login = String(form.get('login') ?? '').trim();
		const password = String(form.get('password') ?? '');
		const next = String(form.get('next') ?? '/');

		if (!login || !password) {
			return fail(400, { error: translate(locals.locale, 'auth.error.missing'), login });
		}

		const user = findUserByLogin(login);
		// One message for both cases, so this cannot be used to enumerate accounts.
		if (!user || !verifyPassword(password, user.password_hash)) {
			return fail(401, { error: translate(locals.locale, 'auth.error.incorrect'), login });
		}
		if (!user.is_active) {
			return fail(403, { error: translate(locals.locale, 'auth.error.disabled'), login });
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
		redirect(303, next.startsWith('/') ? next : '/');
	}
};

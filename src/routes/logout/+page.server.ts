import { redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { destroySession } from '$lib/server/auth';
import { SESSION_COOKIE } from '../../hooks.server';

export const actions: Actions = {
	default: async ({ cookies, locals }) => {
		if (locals.sessionId) destroySession(locals.sessionId);
		cookies.delete(SESSION_COOKIE, { path: '/' });
		redirect(303, '/');
	}
};

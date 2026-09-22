import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { createAccessToken, listAccessTokens, revokeAccessToken } from '$lib/server/auth';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) redirect(303, `/login?next=${encodeURIComponent(url.pathname)}`);
	return {
		tokens: listAccessTokens(locals.user.id),
		gitBase: `${url.origin}/git/${locals.user.username}`
	};
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: 'Sign in first.' });
		const name = String((await request.formData()).get('name') ?? '').trim();
		if (!name) return fail(400, { error: 'Give the token a name so you can recognise it later.' });

		// Shown exactly once; only the hash is kept.
		return { created: createAccessToken(locals.user.id, name), name };
	},

	revoke: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: 'Sign in first.' });
		revokeAccessToken(locals.user.id, String((await request.formData()).get('id') ?? ''));
		return { success: true, message: 'Token revoked.' };
	}
};

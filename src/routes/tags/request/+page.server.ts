import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { canEdit, getProject, listTagCategories, listTags } from '$lib/server/projects';
import { MAX_OPEN_REQUESTS, TagRequestError, listOwnTagRequests, requestTag } from '$lib/server/tagrequests';
import type { User } from '$lib/server/auth';

/** The board a request is for (`?board=owner/slug`), if this person may tag it. */
function boardFrom(value: string | null, user: User) {
	const [owner, slug] = (value ?? '').split('/');
	if (!owner || !slug) return null;
	const project = getProject(owner, slug);
	return project && canEdit(project, user) ? project : null;
}

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) redirect(303, `/login?next=${encodeURIComponent(url.pathname + url.search)}`);
	const board = boardFrom(url.searchParams.get('board'), locals.user);
	return {
		categories: listTagCategories().map(({ id, name }) => ({ id, name })),
		// For the duplicate hint while typing; the server checks again.
		tags: listTags().map(({ slug, name, category, category_name, color }) => ({ slug, name, category, category_name, color })),
		requests: listOwnTagRequests(locals.user.id),
		board: board ? { path: `${board.owner_username}/${board.slug}`, name: board.name } : null,
		maxOpen: MAX_OPEN_REQUESTS
	};
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		if (!locals.user) redirect(303, '/login');
		const form = await request.formData();
		const values = {
			name: String(form.get('name') ?? ''),
			category: String(form.get('category') ?? ''),
			note: String(form.get('note') ?? '')
		};
		try {
			const result = requestTag({
				user: locals.user,
				...values,
				project: boardFrom(String(form.get('board') ?? ''), locals.user)
			});
			return { saved: true, joined: result.joined, name: result.name };
		} catch (thrown) {
			if (thrown instanceof TagRequestError) return fail(400, { error: thrown.in(locals.locale), ...values });
			throw thrown;
		}
	}
};

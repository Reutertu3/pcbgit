import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { browseProjects, isBrowseSort } from '$lib/server/projects';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) redirect(303, '/login?next=/stars');
	const requested = url.searchParams.get('sort');
	const sort = isBrowseSort(requested) ? requested : 'recent';
	return browseProjects({
		viewer: locals.user,
		starredBy: locals.user.id,
		search: url.searchParams.get('q') ?? '',
		sort,
		page: Number(url.searchParams.get('page')) || 1,
		perPage: 24
	});
};

import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { browseProjects } from '$lib/server/projects';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) redirect(303, '/login?next=/stars');
	return browseProjects({
		viewer: locals.user,
		starredBy: locals.user.id,
		search: url.searchParams.get('q') ?? '',
		sort: (url.searchParams.get('sort') as 'recent' | 'stars' | 'name') ?? 'recent',
		page: Number(url.searchParams.get('page')) || 1,
		perPage: 24
	});
};

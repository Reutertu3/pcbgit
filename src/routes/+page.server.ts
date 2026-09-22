import type { PageServerLoad } from './$types';
import { browseProjects, popularTags, LICENSES } from '$lib/server/projects';
import { count } from '$lib/server/db';

export const load: PageServerLoad = async ({ url, locals }) => {
	const params = url.searchParams;
	const result = browseProjects({
		viewer: locals.user,
		search: params.get('q') ?? '',
		tags: params.getAll('tag'),
		license: params.get('license') ?? '',
		sort: (params.get('sort') as 'recent' | 'stars' | 'name' | 'created') ?? 'recent',
		page: Number(params.get('page')) || 1,
		perPage: 24
	});

	return {
		...result,
		tags: popularTags(24),
		licenses: LICENSES,
		filters: {
			q: params.get('q') ?? '',
			tags: params.getAll('tag'),
			license: params.get('license') ?? '',
			sort: params.get('sort') ?? 'recent'
		},
		stats: {
			boards: count("SELECT COUNT(*) FROM projects WHERE visibility = 'public'"),
			designers: count('SELECT COUNT(DISTINCT owner_id) FROM projects'),
			versions: count('SELECT COUNT(*) FROM commits')
		}
	};
};

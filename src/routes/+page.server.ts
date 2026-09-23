import type { PageServerLoad } from './$types';
import { browseAuthors, browseProjects, popularTags } from '$lib/server/projects';
import { count } from '$lib/server/db';

const SORTS = ['name', 'recent', 'created', 'stars'] as const;
type Sort = (typeof SORTS)[number];

export const load: PageServerLoad = async ({ url, locals }) => {
	const params = url.searchParams;
	const requested = params.get('sort') as Sort | null;
	const sort: Sort = requested && SORTS.includes(requested) ? requested : 'name';
	const author = params.get('author') ?? '';

	const result = browseProjects({
		viewer: locals.user,
		search: params.get('q') ?? '',
		tags: params.getAll('tag'),
		owner: author || undefined,
		sort,
		page: Number(params.get('page')) || 1,
		perPage: 24
	});

	return {
		...result,
		tags: popularTags(24),
		authors: browseAuthors(locals.user),
		filters: {
			q: params.get('q') ?? '',
			tags: params.getAll('tag'),
			author,
			sort
		},
		stats: {
			boards: count("SELECT COUNT(*) FROM projects WHERE visibility = 'public'"),
			designers: count('SELECT COUNT(DISTINCT owner_id) FROM projects'),
			versions: count('SELECT COUNT(*) FROM commits')
		}
	};
};

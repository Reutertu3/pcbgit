import type { PageServerLoad } from './$types';
import { browseAuthors, browseProjects, popularTags } from '$lib/server/projects';
import { count } from '$lib/server/db';

const SORTS = ['name', 'recent', 'created', 'stars'] as const;
type Sort = (typeof SORTS)[number];
const isSort = (value: string | null | undefined): value is Sort => SORTS.includes(value as Sort);

/** The visitor's last sort choice, so the list comes back the way they left it. */
const SORT_COOKIE = 'pcbgit_sort';

export const load: PageServerLoad = async ({ url, locals, cookies }) => {
	const params = url.searchParams;
	const requested = params.get('sort');
	// A choice in the URL (the select, or a shared link) wins and is remembered;
	// without one, the remembered choice, and Name for a first visit.
	let sort: Sort = 'name';
	if (isSort(requested)) {
		sort = requested;
		cookies.set(SORT_COOKIE, sort, {
			path: '/',
			maxAge: 60 * 60 * 24 * 365,
			httpOnly: true,
			sameSite: 'lax',
			secure: url.protocol === 'https:'
		});
	} else {
		const remembered = cookies.get(SORT_COOKIE);
		if (isSort(remembered)) sort = remembered;
	}
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

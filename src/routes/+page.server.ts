import type { PageServerLoad } from './$types';
import {
	browseAuthors,
	browseProjects,
	browseTagCounts,
	isBrowseSort,
	listTagCategories,
	listTags,
	type BrowseSort
} from '$lib/server/projects';
import { topTagGroups } from '$lib/taggroups';
import { count } from '$lib/server/db';

/** The visitor's last sort choice, so the list comes back the way they left it. */
const SORT_COOKIE = 'pcbgit_sort';

export const load: PageServerLoad = async ({ url, locals, cookies }) => {
	const params = url.searchParams;
	const requested = params.get('sort');
	// A choice in the URL (the select, or a shared link) wins and is remembered;
	// without one, the remembered choice, and Name for a first visit.
	let sort: BrowseSort = 'name';
	if (isBrowseSort(requested)) {
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
		if (isBrowseSort(remembered)) sort = remembered;
	}
	const author = params.get('author') ?? '';

	const query = {
		viewer: locals.user,
		search: params.get('q') ?? '',
		tags: params.getAll('tag'),
		owner: author || undefined,
		sort,
		page: Number(params.get('page')) || 1,
		perPage: 24
	};
	const result = browseProjects(query);
	// Tag counts follow the filters, so each says what clicking it would leave.
	const tagCounts = browseTagCounts(query);
	const tags = listTags().map((tag) => ({ ...tag, project_count: tagCounts.get(tag.slug) ?? 0 }));

	return {
		...result,
		// The five most used per category, and whichever are being filtered by.
		tagGroups: topTagGroups(listTagCategories(), tags, 5, query.tags),
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

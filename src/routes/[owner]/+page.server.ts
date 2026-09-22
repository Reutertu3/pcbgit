import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { count } from '$lib/server/db';
import { getUserByUsername } from '$lib/server/auth';
import { browseProjects } from '$lib/server/projects';

export const load: PageServerLoad = async ({ params, locals, url }) => {
	const owner = getUserByUsername(params.owner);
	if (!owner || (!owner.is_active && locals.user?.role !== 'admin')) error(404, 'User not found');

	const result = browseProjects({
		viewer: locals.user,
		owner: owner.username,
		search: url.searchParams.get('q') ?? '',
		sort: (url.searchParams.get('sort') as 'recent' | 'stars' | 'name') ?? 'recent',
		page: Number(url.searchParams.get('page')) || 1,
		perPage: 24
	});

	return {
		...result,
		owner: {
			username: owner.username,
			displayName: owner.display_name || owner.username,
			bio: owner.bio,
			role: owner.role,
			isActive: Boolean(owner.is_active),
			createdAt: owner.created_at
		},
		counts: {
			starsGiven: count('SELECT COUNT(*) FROM stars WHERE user_id = ?', owner.id),
			starsReceived: count(
				'SELECT COUNT(*) FROM stars s JOIN projects p ON p.id = s.project_id WHERE p.owner_id = ?',
				owner.id
			),
			versions: count(
				'SELECT COUNT(*) FROM commits c JOIN projects p ON p.id = c.project_id WHERE p.owner_id = ?',
				owner.id
			)
		},
		isSelf: locals.user?.id === owner.id
	};
};

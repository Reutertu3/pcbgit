import { error, redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { count } from '$lib/server/db';
import { queueStats } from '$lib/server/render/worker';
import { updateAvailability } from '$lib/server/updater';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	if (!locals.user) redirect(303, `/login?next=${encodeURIComponent(url.pathname)}`);
	if (locals.user.role !== 'admin') error(403, 'Administrator access required');

	return {
		badges: {
			users: count('SELECT COUNT(*) FROM users'),
			projects: count('SELECT COUNT(*) FROM projects'),
			tags: count('SELECT COUNT(*) FROM tags'),
			jobs: queueStats().queued + queueStats().running,
			updates: updateAvailability()?.behind ?? 0
		}
	};
};

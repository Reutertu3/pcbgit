import type { PageServerLoad } from './$types';
import { count } from '$lib/server/db';
import { kicadVersion } from '$lib/server/render/kicad';
import { queueStats } from '$lib/server/render/worker';

export const load: PageServerLoad = async ({ url }) => ({
	kicad: await kicadVersion(),
	queue: queueStats(),
	stats: {
		boards: count("SELECT COUNT(*) FROM projects WHERE visibility = 'public'"),
		versions: count('SELECT COUNT(*) FROM commits'),
		users: count('SELECT COUNT(*) FROM users WHERE is_active = 1')
	},
	gitBase: `${url.origin}/git`
});

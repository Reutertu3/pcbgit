import type { LayoutServerLoad } from './$types';
import { getSetting } from '$lib/server/db';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	return {
		user: locals.user
			? {
					id: locals.user.id,
					username: locals.user.username,
					displayName: locals.user.display_name || locals.user.username,
					role: locals.user.role
				}
			: null,
		site: {
			name: getSetting('site_name', 'pcbgit'),
			tagline: getSetting('site_tagline', 'Self-hosted home for hardware design'),
			registrationOpen: getSetting('registration_open', 'true') === 'true'
		},
		pathname: url.pathname
	};
};

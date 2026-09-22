import type { LayoutServerLoad } from './$types';
import { getSetting } from '$lib/server/db';
import { unreadCount } from '$lib/server/notifications';

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
		pathname: url.pathname,
		unreadNotifications: locals.user ? unreadCount(locals.user.id) : 0,
		source: sourceLink()
	};
};

/**
 * AGPL-3.0 section 13: users of a network service get a link to its source.
 * Forks running modified code set PCBGIT_SOURCE_URL to their own repository.
 * On GitHub, link the exact commit this image was built from.
 */
function sourceLink() {
	const repo = (process.env.PCBGIT_SOURCE_URL || 'https://github.com/Reutertu3/pcbgit').replace(/\/+$/, '');
	const version = process.env.PCBGIT_VERSION ?? 'dev';
	const exact = /^[0-9a-f]{7,40}$/.test(version) && repo.includes('github.com');
	return exact ? `${repo}/tree/${version}` : repo;
}

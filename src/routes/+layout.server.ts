import type { LayoutServerLoad } from './$types';
import { getSetting } from '$lib/server/db';
import { unreadCount } from '$lib/server/notifications';
import { avatarVersion } from '$lib/server/avatars';
import { runningTag, runningVersion } from '$lib/server/updater';

const DEFAULT_TAGLINE = 'Self-hosted home for hardware design';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	const tagline = getSetting('site_tagline', DEFAULT_TAGLINE);
	return {
		locale: locals.locale,
		user: locals.user
			? {
					id: locals.user.id,
					username: locals.user.username,
					displayName: locals.user.display_name || locals.user.username,
					avatar: avatarVersion(locals.user.id),
					role: locals.user.role
				}
			: null,
		site: {
			name: getSetting('site_name', 'pcbgit'),
			// The stock tagline is translated; one an admin wrote is shown as written.
			tagline: tagline === DEFAULT_TAGLINE ? null : tagline,
			registrationOpen: getSetting('registration_open', 'true') === 'true'
		},
		pathname: url.pathname,
		unreadNotifications: locals.user ? unreadCount(locals.user.id) : 0,
		source: sourceLink(),
		version: version()
	};
};

/** What the footer shows: the running commit, and its release tag when it has one. */
function version() {
	const sha = runningVersion();
	const tag = runningTag();
	const repo = repoUrl();
	const onGitHub = repo.includes('github.com');
	const commit = /^[0-9a-f]{7,40}$/.test(sha);
	return {
		sha: commit ? sha.slice(0, 7) : sha,
		tag,
		href: onGitHub ? (tag ? `${repo}/releases/tag/${tag}` : commit ? `${repo}/commit/${sha}` : null) : null
	};
}

function repoUrl() {
	return (process.env.PCBGIT_SOURCE_URL || 'https://github.com/Reutertu3/pcbgit').replace(/\/+$/, '');
}

/**
 * AGPL-3.0 section 13: users of a network service get a link to its source.
 * Forks running modified code set PCBGIT_SOURCE_URL to their own repository.
 * On GitHub, link the exact commit this image was built from.
 */
function sourceLink() {
	const repo = repoUrl();
	const version = runningVersion();
	const exact = /^[0-9a-f]{7,40}$/.test(version) && repo.includes('github.com');
	return exact ? `${repo}/tree/${version}` : repo;
}

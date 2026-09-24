import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAvatar } from '$lib/server/avatars';

/** Avatar URLs carry the upload time (?v=), so a matching request can be cached for good. */
export const GET: RequestHandler = ({ params, url }) => {
	const avatar = getAvatar(params.username);
	if (!avatar) error(404, 'error.userNotFound');
	const current = url.searchParams.get('v') === String(avatar.updated_at);
	return new Response(Buffer.from(avatar.image), {
		headers: {
			'content-type': avatar.type,
			'cache-control': current ? 'public, max-age=31536000, immutable' : 'public, max-age=60',
			'x-content-type-options': 'nosniff'
		}
	});
};

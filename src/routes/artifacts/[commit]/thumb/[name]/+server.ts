import { error } from '@sveltejs/kit';
import fs from 'node:fs';
import path from 'node:path';
import type { RequestHandler } from './$types';
import { SVG_POLICY, artifactAccess, artifactCacheControl } from '$lib/server/artifactaccess';
import { artifactDir } from '$lib/server/paths';
import { ensureThumbnail, isThumbnailName } from '$lib/server/thumbnails';

/** GET /artifacts/<commit>/thumb/<name> — raster thumbnail of <name>.svg. */
export const GET: RequestHandler = async ({ params, locals }) => {
	if (!isThumbnailName(params.name)) error(400, 'Bad name');
	const visibility = artifactAccess(params.commit, locals.user);
	if (!visibility) error(404, 'Not found');

	const thumbnail = await ensureThumbnail(params.commit, params.name);
	// Without a rasteriser, the original SVG still works; it is just larger.
	const file = thumbnail?.file ?? path.join(artifactDir(params.commit), `${params.name}.svg`);
	if (!fs.existsSync(file)) error(404, 'Not found');

	return new Response(fs.createReadStream(file) as unknown as ReadableStream, {
		headers: {
			'Content-Type': thumbnail?.type ?? 'image/svg+xml',
			'Content-Length': String(fs.statSync(file).size),
			'Cache-Control': artifactCacheControl(visibility),
			...(thumbnail ? {} : { 'Content-Security-Policy': SVG_POLICY })
		}
	});
};

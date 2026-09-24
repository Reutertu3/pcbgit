import { error } from '@sveltejs/kit';
import path from 'node:path';
import type { RequestHandler } from './$types';
import { SVG_POLICY, artifactCacheControl } from '$lib/server/artifactaccess';
import { get } from '$lib/server/db';
import { readBlobBytes } from '$lib/server/git';
import { repoPath } from '$lib/server/paths';
import { canView, getProject } from '$lib/server/projects';

/**
 * Images from a board's repository at one commit, for the pictures its README
 * embeds. Images only: any other file served from this origin (HTML above all)
 * would run as pcbgit. Addressed by commit SHA, so the content never changes.
 */
const IMAGE_TYPES: Record<string, string> = {
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.gif': 'image/gif',
	'.webp': 'image/webp',
	'.svg': 'image/svg+xml'
};
const MAX_BYTES = 10 * 1024 * 1024;

export const GET: RequestHandler = async ({ params, locals, setHeaders }) => {
	const type = IMAGE_TYPES[path.posix.extname(params.path).toLowerCase()];
	if (!type) error(404, 'Not found');
	if (!/^[0-9a-f]{40}$/.test(params.sha)) error(404, 'Not found');
	if (params.path.split('/').some((segment) => !segment || segment === '.' || segment === '..')) error(404, 'Not found');

	const project = getProject(params.owner, params.project);
	if (!project || !canView(project, locals.user)) error(404, 'Not found');
	// Only this board's own versions, not any object the repository happens to hold.
	if (!get('SELECT 1 AS x FROM commits WHERE project_id = ? AND sha = ?', project.id, params.sha)) error(404, 'Not found');

	let bytes: Buffer;
	try {
		bytes = await readBlobBytes(repoPath(project.owner_username, project.slug), params.sha, params.path, MAX_BYTES);
	} catch {
		error(404, 'Not found');
	}

	setHeaders({
		'Content-Type': type,
		'Content-Length': String(bytes.length),
		'Cache-Control': artifactCacheControl(project.visibility),
		'X-Content-Type-Options': 'nosniff',
		...(type === 'image/svg+xml' ? { 'Content-Security-Policy': SVG_POLICY } : {})
	});
	return new Response(new Uint8Array(bytes));
};

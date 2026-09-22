import { error } from '@sveltejs/kit';
import fs from 'node:fs';
import path from 'node:path';
import type { RequestHandler } from './$types';
import { get } from '$lib/server/db';
import { ARTIFACT_DIR } from '$lib/server/paths';
import { canView } from '$lib/server/projects';

const TYPES: Record<string, string> = {
	'.svg': 'image/svg+xml',
	'.glb': 'model/gltf-binary',
	'.json': 'application/json',
	'.csv': 'text/csv',
	'.zip': 'application/zip',
	'.png': 'image/png'
};

export const GET: RequestHandler = async ({ params, locals, setHeaders }) => {
	const commitId = params.commit;
	const relative = params.file;

	// Resolve and confine: the artifact path must stay inside ARTIFACT_DIR.
	const base = path.join(ARTIFACT_DIR, commitId);
	const target = path.resolve(base, relative);
	if (target !== base && !target.startsWith(base + path.sep)) error(400, 'Bad path');

	const owning = get<{ visibility: 'public' | 'private'; owner_id: string }>(
		`SELECT p.visibility, p.owner_id FROM commits c JOIN projects p ON p.id = c.project_id WHERE c.id = ?`,
		commitId
	);
	if (!owning) error(404, 'Not found');
	if (!canView(owning, locals.user)) error(404, 'Not found');

	let stat: fs.Stats;
	try {
		stat = fs.statSync(target);
	} catch {
		error(404, 'Not found');
	}
	if (!stat.isFile()) error(404, 'Not found');

	// Artifacts are immutable once rendered: keyed by commit id, never rewritten in place.
	setHeaders({
		'Content-Type': TYPES[path.extname(target).toLowerCase()] ?? 'application/octet-stream',
		'Content-Length': String(stat.size),
		'Cache-Control': owning.visibility === 'public' ? 'public, max-age=31536000, immutable' : 'private, max-age=600'
	});

	return new Response(fs.createReadStream(target) as unknown as ReadableStream);
};

import { error } from '@sveltejs/kit';
import fs from 'node:fs';
import type { RequestHandler } from './$types';
import { snapshotPath } from '$lib/server/backups';
import { fileBody } from '$lib/server/filebody';
import { SnapshotError } from '$lib/server/restore';

// Admin-only via the /admin-panel guard in hooks.server.ts.
export const GET: RequestHandler = async ({ params }) => {
	let file: string;
	try {
		file = snapshotPath(params.name);
	} catch (thrown) {
		error(404, thrown instanceof SnapshotError ? thrown.message : 'Not found');
	}
	return new Response(fileBody(file), {
		headers: {
			'Content-Type': 'application/gzip',
			'Content-Length': String(fs.statSync(file).size),
			'Content-Disposition': `attachment; filename="${params.name}"`
		}
	});
};

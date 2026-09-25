import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { joinSnapshotPieces, saveSnapshotPiece } from '$lib/server/backups';
import { SnapshotError } from '$lib/server/restore';
import { translate } from '$lib/i18n';

/**
 * POST /admin/backups/upload?id=&name=&part=&parts=   one piece of a snapshot (raw bytes)
 * POST /admin/backups/upload?id=&name=&parts=&join     all pieces are in: join and check
 *
 * Admins only (hooks.server.ts guards /admin). Only application/octet-stream is
 * accepted: a page on another site cannot send that without a CORS preflight,
 * which pcbgit never answers, so it needs no separate cross-site check.
 */
export const POST: RequestHandler = async ({ request, url, locals }) => {
	if (request.headers.get('content-type') !== 'application/octet-stream') {
		return json({ error: translate(locals.locale, 'snapshot.error.badUpload') }, { status: 415 });
	}
	const id = url.searchParams.get('id') ?? '';
	const name = url.searchParams.get('name') ?? '';
	const parts = Number(url.searchParams.get('parts'));

	try {
		if (url.searchParams.has('join')) {
			const saved = await joinSnapshotPieces({ id, name, parts, actorId: locals.user!.id });
			return json({ name: saved, message: translate(locals.locale, 'backups.uploaded', { name: saved }) });
		}
		const part = Number(url.searchParams.get('part'));
		await saveSnapshotPiece({ id, name, part, parts, data: new Uint8Array(await request.arrayBuffer()) });
		return json({ ok: true });
	} catch (error) {
		if (error instanceof SnapshotError) return json({ error: error.in(locals.locale) }, { status: 400 });
		throw error;
	}
};

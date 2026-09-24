import { error } from '@sveltejs/kit';
import fs from 'node:fs';
import path from 'node:path';
import type { RequestHandler } from './$types';
import { SVG_POLICY, artifactAccess, artifactCacheControl } from '$lib/server/artifactaccess';
import { ARTIFACT_DIR } from '$lib/server/paths';
import { fileBody } from '$lib/server/filebody';
import { ibomThemeCss } from '$lib/ibomtheme';
import { darkSchematicSvg, isSchematicSheet } from '$lib/server/render/schematictheme';

const TYPES: Record<string, string> = {
	'.svg': 'image/svg+xml',
	'.pdf': 'application/pdf',
	'.glb': 'model/gltf-binary',
	'.json': 'application/json',
	'.csv': 'text/csv',
	'.zip': 'application/zip',
	'.png': 'image/png',
	'.html': 'text/html; charset=utf-8'
};

/**
 * Rendered pages (iBOM) run their own scripts and carry text from uploaded boards.
 * The CSP sandbox gives them an opaque origin even when opened directly, so they
 * can never read pcbgit's cookies or call its API as the viewer.
 */
const PAGE_POLICY = [
	'sandbox allow-scripts',
	"default-src 'none'",
	"script-src 'unsafe-inline'",
	"style-src 'unsafe-inline'",
	'img-src data: blob:',
	"frame-ancestors 'self'"
].join('; ');

export const GET: RequestHandler = async ({ params, locals, setHeaders, url }) => {
	const commitId = params.commit;
	const relative = params.file;

	// Resolve and confine: the artifact path must stay inside ARTIFACT_DIR.
	const base = path.join(ARTIFACT_DIR, commitId);
	const target = path.resolve(base, relative);
	if (target !== base && !target.startsWith(base + path.sep)) error(400, 'Bad path');

	const visibility = artifactAccess(commitId, locals.user);
	if (!visibility) error(404, 'Not found');

	let stat: fs.Stats;
	try {
		stat = fs.statSync(target);
	} catch {
		error(404, 'Not found');
	}
	if (!stat.isFile()) error(404, 'Not found');

	const extension = path.extname(target).toLowerCase();
	// Artifacts are immutable once rendered: keyed by commit id, never rewritten in place.
	setHeaders({
		'Content-Type': TYPES[extension] ?? 'application/octet-stream',
		'Cache-Control': artifactCacheControl(visibility),
		'X-Content-Type-Options': 'nosniff'
	});

	if (extension === '.svg') setHeaders({ 'Content-Security-Policy': SVG_POLICY });
	// PDFs come out of the renderer and can carry script; they are saved, never
	// opened as a document of this origin.
	if (extension === '.pdf') setHeaders({ 'Content-Disposition': 'attachment' });

	if (extension === '.html') {
		setHeaders({ 'Content-Security-Policy': PAGE_POLICY });
		let html = fs.readFileSync(target, 'utf8');
		// iBOM keeps its settings in storage the sandbox does not have, so the page's
		// built-in default decides; ?dark and ?c follow the viewer's pcbgit theme.
		const dark = url.searchParams.has('dark');
		if (dark) html = html.replace('"dark_mode": false', '"dark_mode": true');
		const css = ibomThemeCss(url.searchParams.get('c'), dark);
		if (css) html = html.replace('</head>', `<style>${css}</style></head>`);
		return new Response(html);
	}

	// Schematic sheets: ?dark swaps KiCad's default colours for the dark look.
	if (url.searchParams.has('dark') && isSchematicSheet(relative)) {
		return new Response(darkSchematicSvg(fs.readFileSync(target, 'utf8')));
	}

	setHeaders({ 'Content-Length': String(stat.size) });
	return new Response(fileBody(target));
};

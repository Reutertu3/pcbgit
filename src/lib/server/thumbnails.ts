import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { RENDER_DIR, artifactDir } from './paths';
import { runTool } from './render/kicad';

/**
 * Raster thumbnails of rendered SVGs for the board cards. A real schematic SVG
 * is ~1.5 MB and a board preview ~1 MB; their 720 px WebP thumbnails are ~50-80 KB.
 * Made with rsvg-convert (+ cwebp when present), cached next to the artifacts.
 */
const WIDTH = 720;
const inflight = new Map<string, Promise<Thumbnail | null>>();

export interface Thumbnail {
	file: string;
	type: 'image/webp' | 'image/png';
}

export function isThumbnailName(name: string) {
	return /^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(name) && !name.includes('..');
}

/** Returns the cached thumbnail, generating it once; null if it cannot be made. */
export function ensureThumbnail(commitId: string, name: string): Promise<Thumbnail | null> {
	const key = `${commitId}/${name}`;
	let pending = inflight.get(key);
	if (!pending) {
		pending = generate(commitId, name).finally(() => inflight.delete(key));
		inflight.set(key, pending);
	}
	return pending;
}

async function generate(commitId: string, name: string): Promise<Thumbnail | null> {
	if (!isThumbnailName(name)) return null;
	const dir = artifactDir(commitId);
	const source = path.join(dir, `${name}.svg`);
	const thumbs = path.join(dir, 'thumbs');
	const webp = path.join(thumbs, `${name}.webp`);
	const png = path.join(thumbs, `${name}.png`);

	if (fs.existsSync(webp)) return { file: webp, type: 'image/webp' };
	if (fs.existsSync(png)) return { file: png, type: 'image/png' };
	if (!fs.existsSync(source)) return null;

	// The rasterisers decode images embedded in schematics, so they run where the
	// render tools do: on a copy in RENDER_DIR, never on the artifact directory.
	await fsp.mkdir(thumbs, { recursive: true });
	const work = await fsp.mkdtemp(path.join(RENDER_DIR, 'thumb-'));
	try {
		const svg = path.join(work, 'source.svg');
		const rendered = path.join(work, 'thumb.png');
		const encoded = path.join(work, 'thumb.webp');
		await fsp.copyFile(source, svg);

		const raster = await runTool('rsvg-convert', ['-w', String(WIDTH), '-f', 'png', '-o', rendered, svg], 60_000);
		// rsvg-convert missing or failed: callers fall back to the SVG.
		if (!raster.ok || !fs.existsSync(rendered)) return null;

		const webpResult = await runTool('cwebp', ['-quiet', '-q', '80', '-alpha_q', '90', rendered, '-o', encoded], 60_000);
		if (webpResult.ok && fs.existsSync(encoded)) {
			await fsp.copyFile(encoded, webp);
			return { file: webp, type: 'image/webp' };
		}
		// No WebP encoder: a PNG is still far smaller than the SVG.
		await fsp.copyFile(rendered, png);
		return { file: png, type: 'image/png' };
	} finally {
		await fsp.rm(work, { recursive: true, force: true });
	}
}

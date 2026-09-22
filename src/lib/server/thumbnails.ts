import { execFile } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { artifactDir } from './paths';

const exec = promisify(execFile);

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

	await fsp.mkdir(thumbs, { recursive: true });
	const temp = path.join(thumbs, `.${name}.${process.pid}.png`);
	try {
		await exec('rsvg-convert', ['-w', String(WIDTH), '-f', 'png', '-o', temp, source], { timeout: 60_000 });
	} catch {
		await fsp.rm(temp, { force: true });
		return null; // rsvg-convert missing or failed: callers fall back to the SVG
	}
	try {
		await exec('cwebp', ['-quiet', '-q', '80', '-alpha_q', '90', temp, '-o', webp], { timeout: 60_000 });
		await fsp.rm(temp, { force: true });
		return { file: webp, type: 'image/webp' };
	} catch {
		// No WebP encoder: a PNG is still far smaller than the SVG.
		await fsp.rename(temp, png);
		return { file: png, type: 'image/png' };
	}
}

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { UserError } from '../i18n';
import { get, now, run } from './db';
import { RENDER_DIR } from './paths';
import { runTool } from './render/kicad';
import { AVATAR_SIZE, avatarSvg, imageInfo } from './avatarimage';

export class AvatarError extends UserError {}

export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

/**
 * Crops and re-encodes an uploaded picture, then stores it. The browser only
 * ever gets our own re-encoding, never the uploaded file. Decoding runs in the
 * renderer like the card thumbnails do: on a copy in RENDER_DIR.
 */
export async function saveAvatar(userId: string, bytes: Uint8Array) {
	if (bytes.byteLength > MAX_AVATAR_BYTES) throw new AvatarError('avatar.error.tooLarge');
	const info = imageInfo(bytes);
	if (!info) throw new AvatarError('avatar.error.format');

	const work = await fsp.mkdtemp(path.join(RENDER_DIR, 'thumb-'));
	try {
		const svg = path.join(work, 'avatar.svg');
		const png = path.join(work, 'avatar.png');
		const webp = path.join(work, 'avatar.webp');
		await fsp.writeFile(svg, avatarSvg(bytes, info));

		const raster = await runTool('rsvg-convert', ['-w', String(AVATAR_SIZE), '-h', String(AVATAR_SIZE), '-f', 'png', '-o', png, svg], 60_000);
		if (!raster.ok || !fs.existsSync(png)) throw new AvatarError('avatar.error.format');

		const encoded = await runTool('cwebp', ['-quiet', '-q', '85', png, '-o', webp], 60_000);
		const [file, type] = encoded.ok && fs.existsSync(webp) ? [webp, 'image/webp'] : [png, 'image/png'];
		run(
			`INSERT INTO avatars (user_id, image, type, updated_at) VALUES (?,?,?,?)
			 ON CONFLICT(user_id) DO UPDATE SET image = excluded.image, type = excluded.type, updated_at = excluded.updated_at`,
			userId,
			await fsp.readFile(file),
			type,
			now()
		);
	} finally {
		await fsp.rm(work, { recursive: true, force: true });
	}
}

export function removeAvatar(userId: string) {
	run('DELETE FROM avatars WHERE user_id = ?', userId);
}

export function getAvatar(username: string) {
	return get<{ image: Uint8Array; type: string; updated_at: number }>(
		`SELECT a.image, a.type, a.updated_at FROM avatars a JOIN users u ON u.id = a.user_id WHERE u.username = ?`,
		username
	);
}

/** The picture's version for avatar URLs; null without one. */
export function avatarVersion(userId: string) {
	return get<{ updated_at: number }>('SELECT updated_at FROM avatars WHERE user_id = ?', userId)?.updated_at ?? null;
}

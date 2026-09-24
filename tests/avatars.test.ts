/** Profile pictures: header checks, EXIF orientation, and the crop/re-encode pipeline. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import zlib from 'node:zlib';

import { avatarSvg, imageInfo } from '../src/lib/server/avatarimage.ts';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pcbgit-avatars-'));
process.env.PCBGIT_DATA_DIR = dataDir;
after(() => fs.rmSync(dataDir, { recursive: true, force: true }));

/** A real, decodable RGB PNG: left half red, right half blue. */
function png(width: number, height: number) {
	const chunk = (type: string, data: Buffer) => {
		const out = Buffer.alloc(12 + data.length);
		out.writeUInt32BE(data.length, 0);
		out.write(type, 4, 'latin1');
		data.copy(out, 8);
		out.writeUInt32BE(zlib.crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
		return out;
	};
	const header = Buffer.alloc(13);
	header.writeUInt32BE(width, 0);
	header.writeUInt32BE(height, 4);
	header.set([8, 2, 0, 0, 0], 8);
	const rows = Buffer.alloc((width * 3 + 1) * height);
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) rows.set(x < width / 2 ? [255, 0, 0] : [0, 0, 255], y * (width * 3 + 1) + 1 + x * 3);
	}
	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk('IHDR', header),
		chunk('IDAT', zlib.deflateSync(rows)),
		chunk('IEND', Buffer.alloc(0))
	]);
}

/** JPEG headers only (SOI, APP1 with EXIF orientation, SOF0): enough for imageInfo. */
function jpegHeader(width: number, height: number, orientation: number, byteOrder: 'II' | 'MM') {
	const le = byteOrder === 'II';
	const tiff = Buffer.alloc(8 + 2 + 12 + 4);
	tiff.write(byteOrder, 0, 'latin1');
	const u16 = (value: number, at: number) => (le ? tiff.writeUInt16LE(value, at) : tiff.writeUInt16BE(value, at));
	const u32 = (value: number, at: number) => (le ? tiff.writeUInt32LE(value, at) : tiff.writeUInt32BE(value, at));
	u16(42, 2);
	u32(8, 4);
	u16(1, 8);
	u16(0x0112, 10);
	u16(3, 12);
	u32(1, 14);
	u16(orientation, 18);
	const exif = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
	const app1 = Buffer.concat([Buffer.from([0xff, 0xe1, 0, 0]), exif]);
	app1.writeUInt16BE(exif.length + 2, 2);
	const sof = Buffer.from([0xff, 0xc0, 0, 11, 8, 0, 0, 0, 0, 1, 1, 0x11, 0]);
	sof.writeUInt16BE(height, 5);
	sof.writeUInt16BE(width, 7);
	return Buffer.concat([Buffer.from([0xff, 0xd8]), app1, sof, Buffer.alloc(16)]);
}

test('recognises the four formats and their sizes from the header', () => {
	assert.deepEqual(imageInfo(png(200, 100)), { type: 'image/png', width: 200, height: 100, orientation: 1 });

	const gif = Buffer.alloc(32);
	gif.write('GIF89a', 0, 'latin1');
	gif.writeUInt16LE(64, 6);
	gif.writeUInt16LE(48, 8);
	assert.deepEqual(imageInfo(gif), { type: 'image/gif', width: 64, height: 48, orientation: 1 });

	const webp = Buffer.alloc(32);
	webp.write('RIFF', 0, 'latin1');
	webp.write('WEBPVP8X', 8, 'latin1');
	webp.writeUIntLE(639, 24, 3);
	webp.writeUIntLE(479, 27, 3);
	assert.deepEqual(imageInfo(webp), { type: 'image/webp', width: 640, height: 480, orientation: 1 });
});

test('reads EXIF orientation in both byte orders', () => {
	assert.deepEqual(imageInfo(jpegHeader(4000, 3000, 6, 'II')), { type: 'image/jpeg', width: 4000, height: 3000, orientation: 6 });
	assert.equal(imageInfo(jpegHeader(4000, 3000, 8, 'MM'))?.orientation, 8);
	assert.equal(imageInfo(jpegHeader(4000, 3000, 42, 'MM'))?.orientation, 1, 'nonsense values are ignored');
});

test('refuses other files and pictures too large to decode', () => {
	assert.equal(imageInfo(Buffer.from('<html><script>alert(1)</script></html>'.padEnd(64))), null);
	assert.equal(imageInfo(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'.padEnd(64))), null);
	const bomb = png(1, 1);
	bomb.writeUInt32BE(20_000, 16);
	bomb.writeUInt32BE(20_000, 20);
	assert.equal(imageInfo(bomb), null);
	assert.equal(imageInfo(jpegHeader(0, 100, 1, 'II')), null);
});

test('the crop SVG turns sideways photos upright and leaves others alone', () => {
	const bytes = png(2, 2);
	const upright = avatarSvg(bytes, { type: 'image/png', width: 2, height: 2, orientation: 1 }, 100);
	assert.ok(!upright.includes('transform'));
	assert.match(upright, /preserveAspectRatio="xMidYMid slice"/);
	const sideways = avatarSvg(bytes, { type: 'image/jpeg', width: 2, height: 2, orientation: 6 }, 100);
	assert.match(sideways, /translate\(50 50\) matrix\(0 1 -1 0 0 0\) translate\(-50 -50\)/);
	assert.match(sideways, /href="data:image\/jpeg;base64,/);
});

const hasTools = (() => {
	try {
		execFileSync('rsvg-convert', ['--version'], { stdio: 'ignore' });
		return true;
	} catch {
		return false;
	}
})();

test('saving crops to a 256 px square, and the picture goes with its user', { skip: !hasTools && 'rsvg-convert not installed' }, async () => {
	const { count, run } = await import('../src/lib/server/db/index.ts');
	const { createUser } = await import('../src/lib/server/auth.ts');
	const avatars = await import('../src/lib/server/avatars.ts');
	const user = createUser({ username: 'pic', email: 'p@example.com', password: 'password123' });

	await avatars.saveAvatar(user.id, png(300, 120));
	const stored = avatars.getAvatar('pic');
	assert.ok(stored);
	const info = imageInfo(stored.image);
	assert.equal(info?.width, 256);
	assert.equal(info?.height, 256);
	assert.equal(info?.type, stored.type);
	assert.equal(avatars.avatarVersion(user.id), stored.updated_at);

	await assert.rejects(avatars.saveAvatar(user.id, Buffer.from('not a picture'.padEnd(64))), avatars.AvatarError);
	assert.ok(avatars.getAvatar('pic'), 'a refused upload keeps the old picture');

	avatars.removeAvatar(user.id);
	assert.equal(avatars.getAvatar('pic'), undefined);

	await avatars.saveAvatar(user.id, png(64, 64));
	run('DELETE FROM users WHERE id = ?', user.id);
	assert.equal(count('SELECT COUNT(*) FROM avatars'), 0);
});

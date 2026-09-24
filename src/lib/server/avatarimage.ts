/**
 * Profile pictures, before any decoder sees them: the format and size come from
 * the file header, so anything that is not a plain PNG/JPEG/WebP/GIF, or is too
 * large to decode safely, is refused here. The decoding itself happens in the
 * renderer (avatars.ts).
 */

export type ImageType = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';

export interface ImageInfo {
	type: ImageType;
	width: number;
	height: number;
	/** EXIF orientation (1–8); phone cameras store the picture sideways and set this. */
	orientation: number;
}

export const AVATAR_SIZE = 256;
/** Pixels, not bytes: a small file can still decode to gigabytes. */
export const MAX_PIXELS = 40_000_000;

export function imageInfo(bytes: Uint8Array): ImageInfo | null {
	const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	if (buf.length < 30) return null;

	if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
		return sized('image/png', buf.readUInt32BE(16), buf.readUInt32BE(20));
	}
	if (buf.toString('latin1', 0, 6) === 'GIF87a' || buf.toString('latin1', 0, 6) === 'GIF89a') {
		return sized('image/gif', buf.readUInt16LE(6), buf.readUInt16LE(8));
	}
	if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') {
		const chunk = buf.toString('latin1', 12, 16);
		if (chunk === 'VP8 ') return sized('image/webp', buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff);
		if (chunk === 'VP8L') {
			const bits = buf.readUInt32LE(21);
			return sized('image/webp', (bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1);
		}
		if (chunk === 'VP8X') return sized('image/webp', buf.readUIntLE(24, 3) + 1, buf.readUIntLE(27, 3) + 1);
		return null;
	}
	if (buf[0] === 0xff && buf[1] === 0xd8) return jpegInfo(buf);
	return null;
}

function sized(type: ImageType, width: number, height: number, orientation = 1): ImageInfo | null {
	if (!width || !height || width * height > MAX_PIXELS) return null;
	return { type, width, height, orientation };
}

/** Walks the JPEG segments up to the image data: EXIF orientation from APP1, size from SOF. */
function jpegInfo(buf: Buffer): ImageInfo | null {
	let orientation = 1;
	let offset = 2;
	while (offset + 4 <= buf.length) {
		if (buf[offset] !== 0xff) return null;
		const marker = buf[offset + 1];
		if (marker === 0xff) {
			offset += 1;
			continue;
		}
		const length = buf.readUInt16BE(offset + 2);
		const start = offset + 4;
		if (length < 2 || start + length - 2 > buf.length) return null;
		if (marker === 0xe1 && buf.toString('latin1', start, start + 6) === 'Exif\0\0') {
			orientation = exifOrientation(buf.subarray(start + 6, start + length - 2)) ?? orientation;
		}
		// SOF0–SOF15, except DHT (C4), JPG (C8) and DAC (CC), which share the range.
		if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
			return sized('image/jpeg', buf.readUInt16BE(start + 3), buf.readUInt16BE(start + 1), orientation);
		}
		if (marker === 0xda) return null;
		offset = start + length - 2;
	}
	return null;
}

function exifOrientation(tiff: Buffer): number | null {
	if (tiff.length < 8) return null;
	const little = tiff.toString('latin1', 0, 2) === 'II';
	const u16 = (at: number) => (little ? tiff.readUInt16LE(at) : tiff.readUInt16BE(at));
	const u32 = (at: number) => (little ? tiff.readUInt32LE(at) : tiff.readUInt32BE(at));
	const ifd = u32(4);
	if (ifd + 2 > tiff.length) return null;
	const entries = u16(ifd);
	for (let i = 0; i < entries; i++) {
		const entry = ifd + 2 + i * 12;
		if (entry + 12 > tiff.length) return null;
		if (u16(entry) === 0x0112) {
			const value = u16(entry + 8);
			return value >= 1 && value <= 8 ? value : null;
		}
	}
	return null;
}

/**
 * How to turn the stored picture upright, as an SVG matrix about the centre.
 * The renderer's decoder ignores EXIF orientation, so it is applied here.
 */
const ORIENTATION: Record<number, string> = {
	2: '-1 0 0 1',
	3: '-1 0 0 -1',
	4: '1 0 0 -1',
	5: '0 1 1 0',
	6: '0 1 -1 0',
	7: '0 -1 -1 0',
	8: '0 -1 1 0'
};

/** An SVG that crops the picture to a centred square, upright, for rsvg-convert to rasterise. */
export function avatarSvg(bytes: Uint8Array, info: ImageInfo, size = AVATAR_SIZE) {
	const half = size / 2;
	const matrix = ORIENTATION[info.orientation];
	const transform = matrix ? ` transform="translate(${half} ${half}) matrix(${matrix} 0 0) translate(${-half} ${-half})"` : '';
	const href = `data:${info.type};base64,${Buffer.from(bytes).toString('base64')}`;
	return (
		`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
		`<g${transform}><image href="${href}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid slice"/></g></svg>`
	);
}

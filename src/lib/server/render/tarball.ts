/**
 * A ustar archive holding one file, for downloads that should arrive packed (the
 * STEP). No `$lib` or db imports, so tests load it directly.
 */

const BLOCK = 512;

/** Writes `value` as a zero-padded octal field of `width` bytes, ending in NUL. */
function octal(header: Buffer, offset: number, width: number, value: number) {
	header.write(value.toString(8).padStart(width - 1, '0') + '\0', offset, width, 'ascii');
}

/** A tar archive with `data` as the regular file `name` (ASCII, under 100 bytes). */
export function tarOneFile(name: string, data: Uint8Array, mtime = Math.floor(Date.now() / 1000)) {
	if (!/^[\x21-\x7e]{1,99}$/.test(name)) throw new Error(`unsupported tar name: ${name}`);
	const header = Buffer.alloc(BLOCK);
	header.write(name, 0, 100, 'ascii');
	octal(header, 100, 8, 0o644); // mode
	octal(header, 108, 8, 0); // uid
	octal(header, 116, 8, 0); // gid
	octal(header, 124, 12, data.byteLength); // size, up to 8 GiB in 11 octal digits
	octal(header, 136, 12, mtime);
	header.write('0', 156, 1, 'ascii'); // regular file
	header.write('ustar\u000000', 257, 8, 'ascii');
	// The checksum is summed with its own field read as spaces.
	header.fill(0x20, 148, 156);
	let sum = 0;
	for (const byte of header) sum += byte;
	header.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'ascii');

	const padding = (BLOCK - (data.byteLength % BLOCK)) % BLOCK;
	// The file, padded to whole blocks, then two empty blocks to end the archive.
	return Buffer.concat([header, data, Buffer.alloc(padding + 2 * BLOCK)]);
}

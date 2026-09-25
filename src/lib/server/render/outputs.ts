/**
 * Reading what the renderer produced. Its directories are shared with the renderer
 * container, which is assumed to be compromisable by a hostile board file: anything
 * in them may have been swapped for a link to /data, a directory or a FIFO. The app
 * resolves those paths with /data mounted, so every read goes through here.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { RENDER_DIR } from '../paths';

export class OutputRefused extends Error {}

/**
 * The real path of a job directory in RENDER_DIR, provided every step from RENDER_DIR
 * down to it is a plain directory. The renderer can rename anything below RENDER_DIR:
 * a job directory swapped for a link into /data must not become the boundary itself.
 */
export async function trustedDir(dir: string) {
	const relative = path.relative(path.resolve(RENDER_DIR), path.resolve(dir));
	if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
		throw new OutputRefused(`not a job directory in the render directory: ${dir}`);
	}
	let current = await fsp.realpath(RENDER_DIR);
	for (const part of relative.split(path.sep)) {
		current = path.join(current, part);
		if (!(await fsp.lstat(current)).isDirectory()) throw new OutputRefused(`not a plain directory: ${current}`);
	}
	return current;
}

/** Where `file` really is, if that is inside `root`; links are resolved as the kernel does. */
export async function realPathInside(file: string, root: string) {
	const realRoot = await trustedDir(root);
	const real = await fsp.realpath(file);
	if (!real.startsWith(realRoot + path.sep)) throw new OutputRefused(`outside ${root}: ${file}`);
	return real;
}

/** The bytes of a plain file inside `root`. Links leaving `root`, and anything but a file, are refused. */
export async function readOutput(file: string, root: string): Promise<Buffer> {
	const real = await realPathInside(file, root);
	// O_NOFOLLOW: a link swapped in after realpath fails to open. O_NONBLOCK: a FIFO
	// cannot stall the app; fstat then refuses it.
	const handle = await fsp.open(real, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
	try {
		if (!(await handle.stat()).isFile()) throw new OutputRefused(`not a file: ${file}`);
		return await handle.readFile();
	} finally {
		await handle.close();
	}
}

/**
 * Creates a file in a directory the renderer can write to. Exclusive create: an
 * existing entry, a planted link included, makes it fail instead of writing through;
 * and the directories above it must not have been swapped for links either.
 */
export async function writeNew(file: string, data: string | Uint8Array) {
	await trustedDir(path.dirname(file));
	await fsp.writeFile(file, data, { flag: 'wx' });
}

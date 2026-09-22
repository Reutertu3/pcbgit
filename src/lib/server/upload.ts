import AdmZip from 'adm-zip';
import path from 'node:path';
import type { UploadFile } from './git';

export const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;
const MAX_FILES = 4000;

/** Files that are noise in a repository and should never be committed. */
const IGNORED = [
	/(^|\/)__MACOSX\//,
	/(^|\/)\.DS_Store$/,
	/(^|\/)Thumbs\.db$/,
	/(^|\/)\.git\//,
	/(^|\/)-backups\//,
	/(^|\/)_autosave-/,
	/-bak$/,
	/\.kicad_prl$/,
	/(^|\/)fp-info-cache$/,
	/\.lck$/
];

export class UploadError extends Error {}

/** Expands an uploaded archive into the file list that becomes a commit. */
export function filesFromZip(buffer: Buffer): UploadFile[] {
	let zip: AdmZip;
	try {
		zip = new AdmZip(buffer);
	} catch {
		throw new UploadError('That file is not a readable ZIP archive.');
	}

	const entries = zip.getEntries().filter((entry) => !entry.isDirectory);
	if (entries.length > MAX_FILES) {
		throw new UploadError(`Archive contains too many files (limit ${MAX_FILES}).`);
	}
	// Check the declared sizes before inflating anything: a small archive can expand to
	// gigabytes. adm-zip inflates into a buffer of exactly the declared size, so it can't lie.
	if (entries.reduce((sum, entry) => sum + entry.header.size, 0) > MAX_UPLOAD_BYTES) {
		throw new UploadError('Archive expands to more than 200 MB.');
	}

	const raw = entries.map((entry) => ({
		path: normalize(entry.entryName),
		data: entry.getData()
	}));

	const kept = raw.filter((file) => file.path && !IGNORED.some((pattern) => pattern.test(file.path)));
	if (!kept.length) throw new UploadError('The archive contained no usable files.');

	// Archives usually wrap everything in one folder; drop it so paths stay short.
	return stripCommonPrefix(kept);
}

/** Rejects absolute paths and traversal; returns a repo-relative POSIX path. */
function normalize(entryName: string) {
	const cleaned = entryName.replace(/\\/g, '/').replace(/^\/+/, '');
	const resolved = path.posix.normalize(cleaned);
	if (resolved.startsWith('../') || resolved === '..' || path.posix.isAbsolute(resolved)) {
		throw new UploadError(`Unsafe path in archive: ${entryName}`);
	}
	return resolved === '.' ? '' : resolved;
}

function stripCommonPrefix(files: UploadFile[]): UploadFile[] {
	if (files.length < 2) return files;
	const first = files[0].path.split('/');
	if (first.length < 2) return files;

	const prefix = first[0];
	const shared = files.every((file) => file.path.startsWith(`${prefix}/`));
	return shared ? files.map((file) => ({ ...file, path: file.path.slice(prefix.length + 1) })) : files;
}

/** True when the upload looks like a KiCad project, so we can warn early. */
export function containsKicadProject(files: UploadFile[]) {
	return files.some((file) => /\.kicad_(pcb|sch|pro)$/.test(file.path));
}

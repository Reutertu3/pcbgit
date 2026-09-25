import AdmZip from 'adm-zip';
import path from 'node:path';
import type { UploadFile } from './git';
import { UserError } from '../i18n';
import { classifyEagleHead } from './render/eagle/detect';

export const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;
const MAX_FILES = 4000;

/**
 * The largest request adapter-node accepts, from BODY_SIZE_LIMIT as it reads it:
 * bytes, or a number with K, M or G (powers of 1024). Its default is 512K;
 * null means no limit. The image sets 210M.
 */
export function bodySizeLimit(value = process.env.BODY_SIZE_LIMIT): number | null {
	const setting = value?.trim() || '512K';
	if (setting === 'Infinity') return null;
	const match = /^(\d+)([KMG]?)$/i.exec(setting);
	if (!match) return null;
	const unit = { '': 1, K: 1024, M: 1024 ** 2, G: 1024 ** 3 }[match[2].toUpperCase() as '' | 'K' | 'M' | 'G'];
	return Number(match[1]) * unit;
}

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

export class UploadError extends UserError {}

/** Expands an uploaded archive into the file list that becomes a commit. */
export function filesFromZip(buffer: Buffer): UploadFile[] {
	let zip: AdmZip;
	try {
		zip = new AdmZip(buffer);
	} catch {
		throw new UploadError('upload.error.notZip');
	}

	const entries = zip.getEntries().filter((entry) => !entry.isDirectory);
	if (entries.length > MAX_FILES) {
		throw new UploadError('upload.error.tooMany', { limit: MAX_FILES });
	}
	// Check the declared sizes before inflating anything: a small archive can expand to
	// gigabytes. adm-zip inflates into a buffer of exactly the declared size, so it can't lie.
	if (entries.reduce((sum, entry) => sum + entry.header.size, 0) > MAX_UPLOAD_BYTES) {
		throw new UploadError('upload.error.tooLarge');
	}

	const raw = entries.map((entry) => ({
		path: normalize(entry.entryName),
		data: entry.getData()
	}));

	const kept = raw.filter((file) => file.path && !IGNORED.some((pattern) => pattern.test(file.path)));
	if (!kept.length) throw new UploadError('upload.error.empty');

	// Archives usually wrap everything in one folder; drop it so paths stay short.
	return stripCommonPrefix(kept);
}

/** Rejects absolute paths and traversal; returns a repo-relative POSIX path. */
function normalize(entryName: string) {
	const cleaned = entryName.replace(/\\/g, '/').replace(/^\/+/, '');
	const resolved = path.posix.normalize(cleaned);
	if (resolved.startsWith('../') || resolved === '..' || path.posix.isAbsolute(resolved)) {
		throw new UploadError('upload.error.unsafePath', { path: entryName });
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

/**
 * Why an upload holds no renderable project, as a translation key, or null when it
 * does: a KiCad project, or an Eagle 6+ schematic or board (recognised by content).
 */
export function projectProblem(files: UploadFile[]) {
	if (files.some((file) => /\.kicad_(pcb|sch|pro)$/.test(file.path))) return null;
	const eagle = files
		.filter((file) => /\.(sch|brd)$/i.test(file.path))
		.map((file) => classifyEagleHead(file.data.subarray(0, 4096)).type);
	if (eagle.includes('eagle')) return null;
	return eagle.includes('legacy') ? ('upload.error.eagleLegacy' as const) : ('upload.error.noKicad' as const);
}

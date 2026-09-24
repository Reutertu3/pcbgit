/**
 * Finds an Eagle project in a checkout. Only Eagle 6 and newer (XML) can be
 * converted; the binary format before it is recognised so the render can say so.
 * No `$lib` imports (see render/kicad.ts).
 */
import fs from 'node:fs';
import path from 'node:path';

export interface EagleProjectFiles {
	/** The schematic and board to convert, if any. */
	sch?: string;
	brd?: string;
	/** Eagle version from the file header, e.g. "6.1". */
	version?: string;
	/** Eagle files in the binary format of Eagle 5 and earlier. */
	legacy: string[];
}

const SKIP_DIRS = new Set(['.git', 'node_modules', '__MACOSX']);
const HEAD_BYTES = 4096;

type Kind = { type: 'eagle'; version: string } | { type: 'legacy' } | { type: 'other' };

/** What a .sch/.brd file is, from its first bytes. */
export function classifyEagleHead(head: Buffer): Kind {
	const text = head.toString('latin1');
	const version = /<eagle\s[^>]*version="([\d.]+)"/.exec(text)?.[1];
	if (version) return { type: 'eagle', version };
	if (/<eagle[\s>]/.test(text)) return { type: 'eagle', version: '' };
	// KiCad 5 and earlier also used .sch, as text; Eagle's old format is binary.
	if (text.startsWith('EESchema') || text.startsWith('PCBNEW') || text.startsWith('(kicad')) return { type: 'other' };
	if (head.subarray(0, 512).includes(0)) return { type: 'legacy' };
	return { type: 'other' };
}

function readHead(file: string) {
	const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
	try {
		const buffer = Buffer.alloc(HEAD_BYTES);
		return buffer.subarray(0, fs.readSync(fd, buffer, 0, HEAD_BYTES, 0));
	} finally {
		fs.closeSync(fd);
	}
}

export function discoverEagleFiles(root: string): EagleProjectFiles {
	const found = { sch: [] as { file: string; version: string }[], brd: [] as { file: string; version: string }[] };
	const legacy: string[] = [];

	// Plain files only: symlinks and directories behind them are not followed.
	const walk = (dir: string, depth: number) => {
		if (depth > 8) return;
		let entries: fs.Dirent[];
		try {
			entries = fs.readdirSync(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				if (!SKIP_DIRS.has(entry.name)) walk(full, depth + 1);
				continue;
			}
			const ext = path.extname(entry.name).toLowerCase();
			if (!entry.isFile() || (ext !== '.sch' && ext !== '.brd')) continue;
			let kind: Kind;
			try {
				kind = classifyEagleHead(readHead(full));
			} catch {
				continue;
			}
			if (kind.type === 'legacy') legacy.push(full);
			else if (kind.type === 'eagle') found[ext === '.sch' ? 'sch' : 'brd'].push({ file: full, version: kind.version });
		}
	};
	walk(root, 0);

	// Prefer a schematic and board that belong together (same name), the shallowest,
	// and of several versions side by side the highest ("v1.5" after "v1.3").
	const stem = (f: string) => path.join(path.dirname(f), path.basename(f, path.extname(f)));
	// "v1.5" in a name: the highest wins; names without one fall back to name order.
	const versionOf = (f: string) => /v?(\d+(?:\.\d+)+)(?!.*\d)/i.exec(path.basename(f, path.extname(f)))?.[1] ?? '';
	const rank = (a: string, b: string) =>
		a.split(path.sep).length - b.split(path.sep).length ||
		versionOf(b).localeCompare(versionOf(a), undefined, { numeric: true }) ||
		b.localeCompare(a, undefined, { numeric: true });
	const brdStems = new Set(found.brd.map((b) => stem(b.file)));
	const paired = found.sch.filter((s) => brdStems.has(stem(s.file))).sort((a, b) => rank(a.file, b.file));
	const sch = paired[0] ?? [...found.sch].sort((a, b) => rank(a.file, b.file))[0];
	const brd = (sch && found.brd.find((b) => stem(b.file) === stem(sch.file))) ?? [...found.brd].sort((a, b) => rank(a.file, b.file))[0];

	return { sch: sch?.file, brd: brd?.file, version: sch?.version || brd?.version || undefined, legacy };
}

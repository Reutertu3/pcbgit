import fs from 'node:fs';
import path from 'node:path';

export interface KicadProjectFiles {
	root: string;
	pro?: string;
	sch: string[];
	rootSch?: string;
	pcb?: string;
}

const SKIP_DIRS = new Set(['.git', 'node_modules', '__MACOSX', '-backups', 'fp-info-cache']);

/** Walks a checkout and finds the KiCad project files, preferring the shallowest project. */
export function discoverKicadFiles(root: string): KicadProjectFiles {
	const found = { pro: [] as string[], sch: [] as string[], pcb: [] as string[] };

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
				if (SKIP_DIRS.has(entry.name) || entry.name.endsWith('.pretty')) continue;
				walk(full, depth + 1);
			} else if (entry.isFile()) {
				if (entry.name.startsWith('_autosave') || entry.name.endsWith('-bak')) continue;
				if (entry.name.endsWith('.kicad_pro')) found.pro.push(full);
				else if (entry.name.endsWith('.kicad_sch')) found.sch.push(full);
				else if (entry.name.endsWith('.kicad_pcb')) found.pcb.push(full);
			}
		}
	};
	walk(root, 0);

	const byDepth = (a: string, b: string) =>
		a.split(path.sep).length - b.split(path.sep).length || a.localeCompare(b);
	found.pro.sort(byDepth);
	found.pcb.sort(byDepth);
	found.sch.sort(byDepth);

	const pro = found.pro[0];
	// The root sheet shares its basename with the project file; otherwise take the shallowest.
	const stem = pro ? path.basename(pro, '.kicad_pro') : undefined;
	const rootSch =
		(stem && found.sch.find((f) => path.basename(f, '.kicad_sch') === stem)) ?? found.sch[0];
	const pcb =
		(stem && found.pcb.find((f) => path.basename(f, '.kicad_pcb') === stem)) ?? found.pcb[0];

	return { root, pro, sch: found.sch, rootSch, pcb };
}

export function hasKicadContent(files: KicadProjectFiles) {
	return Boolean(files.pcb || files.rootSch);
}

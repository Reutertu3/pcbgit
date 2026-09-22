import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { all, newId, now, run } from '../db';
import { artifactDir } from '../paths';

export type ArtifactKind =
	| 'schematic_svg'
	| 'pcb_layer_svg'
	| 'pcb_preview_svg'
	| 'pcb_glb'
	| 'bom_csv'
	| 'drc_json'
	| 'erc_json'
	| 'fab_zip'
	| 'ibom_html';

export interface ArtifactRow {
	id: string;
	commit_id: string;
	kind: ArtifactKind;
	name: string;
	rel_path: string;
	ordinal: number;
	meta: string;
	size_bytes: number;
	created_at: number;
}

export function commitArtifactDir(commitId: string) {
	return artifactDir(commitId);
}

export async function clearArtifacts(commitId: string) {
	run('DELETE FROM artifacts WHERE commit_id = ?', commitId);
	await fsp.rm(commitArtifactDir(commitId), { recursive: true, force: true });
	await fsp.mkdir(commitArtifactDir(commitId), { recursive: true });
}

/** Copies `source` into the commit's artifact directory and records it. */
export async function storeArtifact(opts: {
	commitId: string;
	kind: ArtifactKind;
	name: string;
	source: string;
	targetName?: string;
	ordinal?: number;
	meta?: Record<string, unknown>;
}) {
	const dir = commitArtifactDir(opts.commitId);
	await fsp.mkdir(dir, { recursive: true });
	const targetName = opts.targetName ?? path.basename(opts.source);
	const target = path.join(dir, targetName);
	await fsp.copyFile(opts.source, target);
	const size = (await fsp.stat(target)).size;

	run(
		`INSERT INTO artifacts (id, commit_id, kind, name, rel_path, ordinal, meta, size_bytes, created_at)
		 VALUES (?,?,?,?,?,?,?,?,?)`,
		newId(),
		opts.commitId,
		opts.kind,
		opts.name,
		path.join(opts.commitId, targetName),
		opts.ordinal ?? 0,
		JSON.stringify(opts.meta ?? {}),
		size,
		now()
	);
	return target;
}

export function listArtifacts(commitId: string, kind?: ArtifactKind) {
	return kind
		? all<ArtifactRow>(
				'SELECT * FROM artifacts WHERE commit_id = ? AND kind = ? ORDER BY ordinal, name',
				commitId,
				kind
			)
		: all<ArtifactRow>('SELECT * FROM artifacts WHERE commit_id = ? ORDER BY kind, ordinal, name', commitId);
}

export function artifactMeta<T = Record<string, unknown>>(row: ArtifactRow): T {
	try {
		return JSON.parse(row.meta) as T;
	} catch {
		return {} as T;
	}
}

/** Pulls the drawing extents out of an SVG so layers can be stacked precisely. */
export function svgGeometry(svgPath: string) {
	let head = '';
	try {
		const fd = fs.openSync(svgPath, 'r');
		const buffer = Buffer.alloc(4096);
		const read = fs.readSync(fd, buffer, 0, buffer.length, 0);
		fs.closeSync(fd);
		head = buffer.subarray(0, read).toString('utf8');
	} catch {
		return null;
	}

	const viewBox = /viewBox\s*=\s*"([^"]+)"/.exec(head)?.[1] ?? null;
	const width = /\swidth\s*=\s*"([^"]+)"/.exec(head)?.[1] ?? null;
	const height = /\sheight\s*=\s*"([^"]+)"/.exec(head)?.[1] ?? null;
	return { viewBox, width, height };
}

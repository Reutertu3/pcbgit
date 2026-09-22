import { execFile } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { audit, count, db, getSetting } from './db';
import { ARTIFACT_DIR, BACKUP_DIR, DATA_DIR, TMP_DIR } from './paths';
import {
	SNAPSHOT_FORMAT,
	SNAPSHOT_VERSION,
	SnapshotError,
	checkArchive,
	isSnapshotName,
	readManifest,
	type SnapshotManifest
} from './restore';

const exec = promisify(execFile);

export interface SnapshotInfo {
	name: string;
	size: number;
	modified: number;
	manifest: SnapshotManifest | null;
}

export interface PreRestoreInfo {
	name: string;
	modified: number;
}

/**
 * Writes one self-contained archive: manifest, a consistent copy of the
 * database, every repository and optionally the rendered artifacts.
 * ponytail: repos are copied live; a push landing mid-snapshot can be half
 * captured. Pause pushes (or accept a later snapshot) if that matters.
 */
export async function createSnapshot(opts: { includeArtifacts: boolean; actorId: string }) {
	const work = await fsp.mkdtemp(path.join(TMP_DIR, 'snapshot-'));
	try {
		// VACUUM INTO gives a transaction-consistent copy while the app keeps running.
		const dbCopy = path.join(work, 'pcbgit.db');
		db.exec(`VACUUM INTO '${dbCopy.replace(/'/g, "''")}'`);

		const manifest: SnapshotManifest = {
			format: SNAPSHOT_FORMAT,
			version: SNAPSHOT_VERSION,
			created_at: Date.now(),
			includes_artifacts: opts.includeArtifacts,
			site_name: getSetting('site_name', 'pcbgit'),
			counts: {
				users: count('SELECT COUNT(*) FROM users'),
				projects: count('SELECT COUNT(*) FROM projects'),
				commits: count('SELECT COUNT(*) FROM commits'),
				tags: count('SELECT COUNT(*) FROM tags')
			}
		};
		await fsp.writeFile(path.join(work, 'manifest.json'), JSON.stringify(manifest, null, 2));

		const stamp = new Date(manifest.created_at).toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-');
		const name = uniqueName(`pcbgit-snapshot-${stamp}${opts.includeArtifacts ? '' : '-lite'}.tar.gz`);
		const target = path.join(BACKUP_DIR, name);
		const partial = `${target}.partial`;

		// Manifest first so reading it back only has to decompress the archive's head.
		const args = ['-czf', partial, '-C', work, 'manifest.json', 'pcbgit.db', '-C', DATA_DIR, 'repos'];
		if (opts.includeArtifacts && fs.existsSync(ARTIFACT_DIR)) args.push('artifacts');
		await exec('tar', args, { maxBuffer: 16 * 1024 * 1024 });
		await fsp.rename(partial, target);

		writeSidecar(name, manifest);
		audit(opts.actorId, 'admin.snapshot_create', name, opts.includeArtifacts ? 'with artifacts' : 'without artifacts');
		return name;
	} finally {
		await fsp.rm(work, { recursive: true, force: true });
	}
}

function uniqueName(name: string) {
	let candidate = name;
	for (let i = 2; fs.existsSync(path.join(BACKUP_DIR, candidate)); i++) {
		candidate = name.replace(/\.tar\.gz$/, `-${i}.tar.gz`);
	}
	return candidate;
}

/** The manifest is cached beside the archive so listing never decompresses it. */
function writeSidecar(name: string, manifest: SnapshotManifest) {
	fs.writeFileSync(path.join(BACKUP_DIR, `${name}.json`), JSON.stringify(manifest));
}

function manifestFor(name: string): SnapshotManifest | null {
	const sidecar = path.join(BACKUP_DIR, `${name}.json`);
	try {
		return JSON.parse(fs.readFileSync(sidecar, 'utf8'));
	} catch {
		// Archives copied in by hand have no sidecar yet.
		try {
			const manifest = readManifest(path.join(BACKUP_DIR, name));
			writeSidecar(name, manifest);
			return manifest;
		} catch {
			return null;
		}
	}
}

export function listSnapshots() {
	const snapshots: SnapshotInfo[] = [];
	const preRestore: PreRestoreInfo[] = [];

	for (const entry of fs.readdirSync(BACKUP_DIR, { withFileTypes: true })) {
		const full = path.join(BACKUP_DIR, entry.name);
		if (entry.isDirectory() && entry.name.startsWith('pre-restore-')) {
			preRestore.push({ name: entry.name, modified: fs.statSync(full).mtimeMs });
		} else if (entry.isFile() && isSnapshotName(entry.name)) {
			const stat = fs.statSync(full);
			snapshots.push({ name: entry.name, size: stat.size, modified: stat.mtimeMs, manifest: manifestFor(entry.name) });
		}
	}

	snapshots.sort((a, b) => b.modified - a.modified);
	preRestore.sort((a, b) => b.modified - a.modified);
	return { snapshots, preRestore };
}

export function snapshotPath(name: string) {
	if (!isSnapshotName(name)) throw new SnapshotError('snapshot.error.badName');
	const full = path.join(BACKUP_DIR, name);
	if (!fs.existsSync(full)) throw new SnapshotError('snapshot.error.notFound');
	return full;
}

export function deleteBackupEntry(name: string, actorId: string) {
	if (isSnapshotName(name)) {
		fs.rmSync(path.join(BACKUP_DIR, name), { force: true });
		fs.rmSync(path.join(BACKUP_DIR, `${name}.json`), { force: true });
	} else if (/^pre-restore-[A-Za-z0-9-]+$/.test(name)) {
		fs.rmSync(path.join(BACKUP_DIR, name), { recursive: true, force: true });
	} else {
		throw new SnapshotError('snapshot.error.badName');
	}
	audit(actorId, 'admin.backup_delete', name);
}

/** Stores an uploaded archive in the backups folder after validating it. */
export async function saveUploadedSnapshot(file: File, actorId: string) {
	const base = file.name.replace(/[^A-Za-z0-9._-]/g, '_').replace(/^[._-]+/, '') || 'uploaded';
	const name = uniqueName(base.endsWith('.tar.gz') ? base : `${base}.tar.gz`);
	const target = path.join(BACKUP_DIR, name);
	await fsp.writeFile(target, Buffer.from(await file.arrayBuffer()));

	try {
		checkArchive(target);
		writeSidecar(name, readManifest(target));
	} catch (error) {
		await fsp.rm(target, { force: true });
		throw error;
	}
	audit(actorId, 'admin.snapshot_upload', name);
	return name;
}


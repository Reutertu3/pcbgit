/**
 * Snapshot validation and restore.
 *
 * A restore never swaps data under a running server. It is checked and
 * unpacked into a staging directory first, then applied at the next boot,
 * before the database is opened, so no handle or job can see a half-swapped
 * state. This module deliberately does not import the db module: it runs
 * before the database exists.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { UserError } from '../i18n';

export const SNAPSHOT_FORMAT = 'pcbgit-snapshot';
/**
 * The project was called pcbhub, then Kupfergit. Data and snapshots from either
 * still restore. Newest name first: that is the one most likely present.
 */
const LEGACY_FORMATS = ['kupfergit-snapshot', 'pcbhub-snapshot'] as const;
const LEGACY_DBS = ['kupfergit.db', 'pcbhub.db'];
export const SNAPSHOT_VERSION = 1;

export interface SnapshotManifest {
	format: typeof SNAPSHOT_FORMAT | (typeof LEGACY_FORMATS)[number];
	version: number;
	created_at: number;
	includes_artifacts: boolean;
	site_name: string;
	counts: { users: number; projects: number; commits: number; tags: number };
}

export class SnapshotError extends UserError {}

export function stagingDir(dataDir: string) {
	return path.join(dataDir, 'restore-staging');
}

export function rerenderFlag(dataDir: string) {
	return path.join(dataDir, '.rerender-all');
}

export function isSnapshotName(name: string) {
	return /^[A-Za-z0-9][A-Za-z0-9._-]*\.tar\.gz$/.test(name) && !name.includes('..');
}

/**
 * Rejects anything that could write outside the extraction directory:
 * absolute paths, "..", and links (a link plus a file through it escapes).
 */
export function checkArchive(file: string) {
	let names: string[];
	let verbose: string[];
	try {
		names = execFileSync('tar', ['-tzf', file], { maxBuffer: 256 * 1024 * 1024 }).toString().split('\n').filter(Boolean);
		verbose = execFileSync('tar', ['-tvzf', file], { maxBuffer: 256 * 1024 * 1024 }).toString().split('\n').filter(Boolean);
	} catch {
		throw new SnapshotError('snapshot.error.notTar');
	}

	for (const name of names) {
		const clean = name.replace(/^\.\//, '');
		if (clean.startsWith('/') || clean.split('/').includes('..')) {
			throw new SnapshotError('upload.error.unsafePath', { path: name });
		}
		if (!/^(manifest\.json|(pcbgit|kupfergit|pcbhub)\.db|repos(\/.*)?|artifacts(\/.*)?)$/.test(clean)) {
			throw new SnapshotError('snapshot.error.unexpected', { path: name });
		}
	}
	if (verbose.some((line) => line[0] === 'l' || line[0] === 'h')) {
		throw new SnapshotError('snapshot.error.links');
	}

	const present = new Set(names.map((name) => name.replace(/^\.\//, '')));
	if (!present.has('manifest.json') || !['pcbgit.db', ...LEGACY_DBS].some((name) => present.has(name))) {
		throw new SnapshotError('snapshot.error.missing');
	}
}

export function readManifest(file: string): SnapshotManifest {
	let raw: string;
	try {
		raw = execFileSync('tar', ['-xzOf', file, 'manifest.json']).toString();
	} catch {
		throw new SnapshotError('snapshot.error.manifestRead');
	}
	let manifest: SnapshotManifest;
	try {
		manifest = JSON.parse(raw);
	} catch {
		throw new SnapshotError('snapshot.error.manifestJson');
	}
	if (manifest.format !== SNAPSHOT_FORMAT && !(LEGACY_FORMATS as readonly string[]).includes(manifest.format)) {
		throw new SnapshotError('snapshot.error.notSnapshot');
	}
	if (manifest.version > SNAPSHOT_VERSION) {
		throw new SnapshotError('snapshot.error.newer', { version: manifest.version });
	}
	return manifest;
}

function checkDatabase(dbPath: string) {
	let database: DatabaseSync | undefined;
	try {
		database = new DatabaseSync(dbPath, { readOnly: true });
		const result = database.prepare('PRAGMA integrity_check').get() as { integrity_check: string };
		if (result.integrity_check !== 'ok') throw new SnapshotError('snapshot.error.integrity', { detail: result.integrity_check });
		const users = database.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name IN ('users','projects','commits')").get() as { n: number };
		if (users.n !== 3) throw new SnapshotError('snapshot.error.tables');
	} catch (error) {
		if (error instanceof SnapshotError) throw error;
		throw new SnapshotError('snapshot.error.dbOpen', { detail: (error as Error).message });
	} finally {
		database?.close();
	}
}

/** Validates and unpacks a snapshot; it is applied at the next boot. */
export function stageSnapshot(file: string, dataDir: string) {
	checkArchive(file);
	const manifest = readManifest(file);

	const staging = stagingDir(dataDir);
	fs.rmSync(staging, { recursive: true, force: true });
	fs.mkdirSync(staging, { recursive: true });
	try {
		execFileSync('tar', ['-xzf', file, '-C', staging, '--no-same-owner'], { maxBuffer: 16 * 1024 * 1024 });
		for (const name of LEGACY_DBS) {
			const legacy = path.join(staging, name);
			if (fs.existsSync(legacy)) fs.renameSync(legacy, path.join(staging, 'pcbgit.db'));
		}
		checkDatabase(path.join(staging, 'pcbgit.db'));
	} catch (error) {
		fs.rmSync(staging, { recursive: true, force: true });
		if (error instanceof SnapshotError) throw error;
		throw new SnapshotError('snapshot.error.extract', { detail: (error as Error).message });
	}
	// Written last: its presence is what marks the staging area as complete.
	fs.writeFileSync(path.join(staging, 'READY'), JSON.stringify(manifest));
	return manifest;
}

export function pendingRestore(dataDir: string): SnapshotManifest | null {
	try {
		return JSON.parse(fs.readFileSync(path.join(stagingDir(dataDir), 'READY'), 'utf8'));
	} catch {
		return null;
	}
}

export function cancelPendingRestore(dataDir: string) {
	fs.rmSync(stagingDir(dataDir), { recursive: true, force: true });
}

const SWAPPED = ['pcbgit.db', 'pcbgit.db-wal', 'pcbgit.db-shm', 'repos', 'artifacts'];

/**
 * Swaps a staged snapshot into place. The previous data is moved (not copied,
 * so it is cheap) into backups/pre-restore-<time>/ and kept until an admin
 * deletes it. A failure part way moves everything back.
 */
export function applyPendingRestore(dataDir: string) {
	const manifest = pendingRestore(dataDir);
	if (!manifest) return null;

	const staging = stagingDir(dataDir);
	const stamp = new Date().toISOString().replace(/[:.]/g, '-');
	const keep = path.join(dataDir, 'backups', `pre-restore-${stamp}`);
	// Empty folders (a fresh instance creates them at boot) are not data worth keeping.
	for (const name of SWAPPED) {
		const current = path.join(dataDir, name);
		if (fs.existsSync(current) && fs.statSync(current).isDirectory() && fs.readdirSync(current).length === 0) {
			fs.rmdirSync(current);
		}
	}
	if (SWAPPED.some((name) => fs.existsSync(path.join(dataDir, name)))) fs.mkdirSync(keep, { recursive: true });

	const movedOut: string[] = [];
	const movedIn: string[] = [];
	try {
		for (const name of SWAPPED) {
			const current = path.join(dataDir, name);
			if (fs.existsSync(current)) {
				fs.renameSync(current, path.join(keep, name));
				movedOut.push(name);
			}
		}
		for (const name of ['pcbgit.db', 'repos', 'artifacts']) {
			const staged = path.join(staging, name);
			if (fs.existsSync(staged)) {
				fs.renameSync(staged, path.join(dataDir, name));
				movedIn.push(name);
			}
		}
	} catch (error) {
		for (const name of movedIn) fs.renameSync(path.join(dataDir, name), path.join(staging, name));
		for (const name of movedOut) fs.renameSync(path.join(keep, name), path.join(dataDir, name));
		fs.rmSync(keep, { recursive: true, force: true });
		console.error('[restore] failed, previous data put back:', error);
		return null;
	}

	fs.mkdirSync(path.join(dataDir, 'repos'), { recursive: true });
	fs.mkdirSync(path.join(dataDir, 'artifacts'), { recursive: true });
	// Without rendered output every version needs rendering again.
	if (!manifest.includes_artifacts) fs.writeFileSync(rerenderFlag(dataDir), '');
	fs.rmSync(staging, { recursive: true, force: true });
	const kept = movedOut.length ? `; previous data kept in ${keep}` : '';
	console.log(`[restore] applied snapshot from ${new Date(manifest.created_at).toISOString()}${kept}`);
	return manifest;
}

/** Instances created before the rename keep their data under the old file name. */
export function migrateLegacyDatabase(dataDir: string) {
	const current = path.join(dataDir, 'pcbgit.db');
	if (fs.existsSync(current)) return;
	const legacyName = LEGACY_DBS.find((name) => fs.existsSync(path.join(dataDir, name)));
	if (!legacyName) return;
	const legacy = path.join(dataDir, legacyName);
	for (const suffix of ['', '-wal', '-shm']) {
		if (fs.existsSync(legacy + suffix)) fs.renameSync(legacy + suffix, current + suffix);
	}
	console.log(`[pcbgit] renamed ${legacyName} to pcbgit.db`);
}

/**
 * Fresh deploys: PCBGIT_IMPORT_SNAPSHOT=/path/to/snapshot.tar.gz imports on
 * the first boot of an empty instance. It never overwrites an existing one.
 */
export function importOnFirstBoot(dataDir: string) {
	const file = process.env.PCBGIT_IMPORT_SNAPSHOT;
	if (!file || fs.existsSync(path.join(dataDir, 'pcbgit.db'))) return;
	if (!fs.existsSync(file)) {
		console.error(`[restore] PCBGIT_IMPORT_SNAPSHOT points at a missing file: ${file}`);
		return;
	}
	try {
		stageSnapshot(file, dataDir);
		console.log(`[restore] importing ${file} into a fresh instance`);
	} catch (error) {
		console.error(`[restore] could not import ${file}: ${(error as Error).message}`);
	}
}

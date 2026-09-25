import { execFile } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { audit, count, db, getSetting } from './db';
import { formatSize, freeDiskSpace, minFreeDisk } from './limits';
import { ARTIFACT_DIR, BACKUP_DIR, DATA_DIR, TMP_DIR } from './paths';
import {
	SNAPSHOT_FORMAT,
	SNAPSHOT_VERSION,
	SnapshotError,
	checkArchiveAsync,
	isSnapshotName,
	readManifest,
	readManifestAsync,
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
	await checkSnapshotSpace(0);
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
	const name = uniqueName(snapshotFileName(file.name));
	const target = path.join(BACKUP_DIR, name);
	await fsp.writeFile(target, Buffer.from(await file.arrayBuffer()));
	return adoptSnapshot(target, name, actorId);
}

function snapshotFileName(original: string) {
	const base = original.replace(/[^A-Za-z0-9._-]/g, '_').replace(/^[._-]+/, '') || 'uploaded';
	return base.endsWith('.tar.gz') ? base : `${base}.tar.gz`;
}

/** Validates an archive now in the backups folder and lists it, or removes it. */
async function adoptSnapshot(target: string, name: string, actorId: string) {
	try {
		// Asynchronous: listing a large snapshot takes a while, and must not stall the server.
		await checkArchiveAsync(target);
		writeSidecar(name, await readManifestAsync(target));
	} catch (error) {
		await fsp.rm(target, { force: true });
		throw error;
	}
	audit(actorId, 'admin.snapshot_upload', name);
	return name;
}

/*
 * Snapshots of any size are uploaded in pieces: each request stays under the
 * server's body limit, and memory holds one piece at a time. Pieces are kept as
 * <name>.part-<n> in incoming/<upload id>/ until the last one arrives.
 */
export const PIECE_MAX = 32 * 1024 * 1024;
const MAX_PIECES = 100_000;
const INCOMING_DIR = path.join(BACKUP_DIR, 'incoming');
// Uploads abandoned for this long are removed when the next one starts.
const STALE_UPLOAD_MS = 24 * 60 * 60 * 1000;

/** Snapshots stop short of the minimum free disk space (PCBGIT_MIN_FREE_DISK), like uploads do. */
async function checkSnapshotSpace(bytes: number) {
	const free = await freeDiskSpace();
	if (free - bytes < minFreeDisk()) throw new SnapshotError('snapshot.error.diskFull', { free: formatSize(free), min: formatSize(minFreeDisk()) });
}

function uploadDir(id: string) {
	if (!/^[0-9a-f]{32}$/.test(id)) throw new SnapshotError('snapshot.error.badUpload');
	return path.join(INCOMING_DIR, id);
}

function pieceFile(dir: string, name: string, part: number) {
	return path.join(dir, `${snapshotFileName(name)}.part-${part}`);
}

function checkPieceNumbers(part: number, parts: number) {
	if (!Number.isInteger(parts) || parts < 1 || parts > MAX_PIECES || !Number.isInteger(part) || part < 1 || part > parts) {
		throw new SnapshotError('snapshot.error.badUpload');
	}
}

async function removeStaleUploads() {
	let entries: string[];
	try {
		entries = await fsp.readdir(INCOMING_DIR);
	} catch {
		return;
	}
	for (const entry of entries) {
		const dir = path.join(INCOMING_DIR, entry);
		const stat = await fsp.stat(dir).catch(() => null);
		if (stat && Date.now() - stat.mtimeMs > STALE_UPLOAD_MS) await fsp.rm(dir, { recursive: true, force: true });
	}
}

/** Stores piece `part` of `parts`; sending a piece again replaces the earlier attempt. */
export async function saveSnapshotPiece(opts: { id: string; name: string; part: number; parts: number; data: Uint8Array }) {
	const dir = uploadDir(opts.id);
	checkPieceNumbers(opts.part, opts.parts);
	if (opts.data.byteLength === 0 || opts.data.byteLength > PIECE_MAX) throw new SnapshotError('snapshot.error.badUpload');
	await checkSnapshotSpace(opts.data.byteLength);
	if (opts.part === 1) await removeStaleUploads();

	await fsp.mkdir(dir, { recursive: true });
	const piece = pieceFile(dir, opts.name, opts.part);
	await fsp.writeFile(`${piece}.tmp`, opts.data);
	await fsp.rename(`${piece}.tmp`, piece);
}

/**
 * Joins the pieces into one archive in the backups folder, then validates it as
 * an upload. Each piece is deleted once appended, so the disk holds the snapshot
 * plus one piece, not the snapshot twice.
 */
export async function joinSnapshotPieces(opts: { id: string; name: string; parts: number; actorId: string }) {
	const dir = uploadDir(opts.id);
	checkPieceNumbers(1, opts.parts);
	for (let part = 1; part <= opts.parts; part++) {
		if (!fs.existsSync(pieceFile(dir, opts.name, part))) throw new SnapshotError('snapshot.error.pieceMissing', { part });
	}

	const name = uniqueName(snapshotFileName(opts.name));
	const target = path.join(BACKUP_DIR, name);
	const out = await fsp.open(target, 'wx');
	try {
		try {
			for (let part = 1; part <= opts.parts; part++) {
				const piece = pieceFile(dir, opts.name, part);
				for await (const chunk of fs.createReadStream(piece)) await out.write(chunk);
				await fsp.rm(piece);
			}
		} finally {
			await out.close();
		}
	} catch (error) {
		await fsp.rm(target, { force: true });
		throw error;
	} finally {
		// Pieces already appended are gone, so a failed join cannot be resumed.
		await fsp.rm(dir, { recursive: true, force: true });
	}
	return adoptSnapshot(target, name, opts.actorId);
}


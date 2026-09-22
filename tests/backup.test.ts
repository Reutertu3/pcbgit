/**
 * Snapshot round trip: create a snapshot from a populated instance, restore it
 * into a separate empty data directory, and check the result. Also pins down
 * that hostile or broken archives are refused before anything is extracted.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test, { after } from 'node:test';

const source = fs.mkdtempSync(path.join(os.tmpdir(), 'pcbgit-snap-src-'));
const target = fs.mkdtempSync(path.join(os.tmpdir(), 'pcbgit-snap-dst-'));
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'pcbgit-snap-bad-'));
process.env.PCBGIT_DATA_DIR = source;

const { count } = await import('../src/lib/server/db/index.ts');
const { createUser } = await import('../src/lib/server/auth.ts');
const { createProject } = await import('../src/lib/server/projects.ts');
const { commitFiles } = await import('../src/lib/server/git.ts');
const { repoPath } = await import('../src/lib/server/paths.ts');
const { createSnapshot, listSnapshots, snapshotPath } = await import('../src/lib/server/backups.ts');
const restore = await import('../src/lib/server/restore.ts');

after(() => {
	for (const dir of [source, target, scratch]) fs.rmSync(dir, { recursive: true, force: true });
});

test('a snapshot restores into an empty instance with data and repositories intact', async () => {
	const owner = createUser({ username: 'snapper', email: 'snap@example.com', password: 'password123' });
	await createProject({ owner, slug: 'kept-board', name: 'Kept Board' });
	await commitFiles(repoPath('snapper', 'kept-board'), [{ path: 'notes.txt', data: Buffer.from('hi') }], {
		message: 'snap me',
		authorName: 'Snapper',
		authorEmail: 'snap@example.com',
		branch: 'main'
	});

	const name = await createSnapshot({ includeArtifacts: false, actorId: owner.id });
	const listed = listSnapshots().snapshots.find((snap) => snap.name === name);
	assert.ok(listed, 'snapshot is listed');
	assert.equal(listed!.manifest?.counts.projects, 1);
	assert.equal(listed!.manifest?.includes_artifacts, false);

	// Restore into a second data directory holding only the empty folders a boot creates.
	fs.mkdirSync(path.join(target, 'repos'));
	fs.mkdirSync(path.join(target, 'artifacts'));
	restore.stageSnapshot(snapshotPath(name), target);
	assert.ok(restore.pendingRestore(target), 'restore is staged');
	const applied = restore.applyPendingRestore(target);
	assert.ok(applied, 'restore applied');

	const restored = new DatabaseSync(path.join(target, 'pcbgit.db'), { readOnly: true });
	const row = restored.prepare('SELECT COUNT(*) AS n FROM projects WHERE slug = ?').get('kept-board') as { n: number };
	restored.close();
	assert.equal(row.n, 1, 'board survived the round trip');

	const log = execFileSync('git', ['--git-dir', path.join(target, 'repos/snapper/kept-board.git'), 'log', '--format=%s']).toString();
	assert.match(log, /snap me/, 'repository history survived');
	assert.ok(fs.existsSync(restore.rerenderFlag(target)), 'a lite snapshot asks for a full re-render');
	assert.ok(!fs.existsSync(restore.stagingDir(target)), 'staging area is cleaned up');
	assert.ok(!fs.existsSync(path.join(target, 'backups')), 'no pointless pre-restore copy on a fresh instance');
	assert.equal(count('SELECT COUNT(*) FROM projects'), 1, 'source instance untouched');
});

test('restoring over existing data keeps the old data as a pre-restore copy', async () => {
	// `target` now holds restored data; restore the same snapshot over it again.
	const [snap] = listSnapshots().snapshots;
	fs.writeFileSync(path.join(target, 'repos', 'marker.txt'), 'old');
	restore.stageSnapshot(snapshotPath(snap.name), target);
	restore.applyPendingRestore(target);

	const kept = fs.readdirSync(path.join(target, 'backups')).filter((name) => name.startsWith('pre-restore-'));
	assert.equal(kept.length, 1);
	assert.ok(fs.existsSync(path.join(target, 'backups', kept[0], 'repos', 'marker.txt')), 'old data was moved aside, not lost');
	assert.ok(!fs.existsSync(path.join(target, 'repos', 'marker.txt')), 'new data is in place');
});

function makeArchive(name: string, build: (dir: string) => string[]) {
	const dir = fs.mkdtempSync(path.join(scratch, 'src-'));
	const members = build(dir);
	const file = path.join(scratch, name);
	execFileSync('tar', ['-czf', file, '-C', dir, ...members]);
	return file;
}

test('snapshots made under the Kupfergit name still restore', () => {
	const legacy = makeArchive('kupfer.tar.gz', (dir) => {
		fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ format: 'kupfergit-snapshot', version: 1, created_at: 1, includes_artifacts: true, site_name: 'x', counts: {} }));
		const database = new DatabaseSync(path.join(dir, 'kupfergit.db'));
		database.exec('CREATE TABLE users (id); CREATE TABLE projects (id); CREATE TABLE commits (id);');
		database.close();
		return ['manifest.json', 'kupfergit.db'];
	});
	const dest = fs.mkdtempSync(path.join(scratch, 'kupfer-snap-'));
	restore.stageSnapshot(legacy, dest);
	restore.applyPendingRestore(dest);
	assert.ok(fs.existsSync(path.join(dest, 'pcbgit.db')));
});

test('snapshots made under the old project name still restore', () => {
	const legacy = makeArchive('legacy.tar.gz', (dir) => {
		fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ format: 'pcbhub-snapshot', version: 1, created_at: 1, includes_artifacts: true, site_name: 'x', counts: {} }));
		const database = new DatabaseSync(path.join(dir, 'pcbhub.db'));
		database.exec('CREATE TABLE users (id); CREATE TABLE projects (id); CREATE TABLE commits (id);');
		database.close();
		return ['manifest.json', 'pcbhub.db'];
	});
	const dest = fs.mkdtempSync(path.join(scratch, 'legacy-'));
	restore.stageSnapshot(legacy, dest);
	restore.applyPendingRestore(dest);
	assert.ok(fs.existsSync(path.join(dest, 'pcbgit.db')), 'legacy database lands under the new name');
});

test('a data directory from the Kupfergit days keeps its database', () => {
	const dir = fs.mkdtempSync(path.join(scratch, 'kupfer-'));
	fs.writeFileSync(path.join(dir, 'kupfergit.db'), 'db');
	restore.migrateLegacyDatabase(dir);
	assert.equal(fs.readFileSync(path.join(dir, 'pcbgit.db'), 'utf8'), 'db');
	assert.ok(!fs.existsSync(path.join(dir, 'kupfergit.db')));
});

test('a data directory from before the rename keeps its database', () => {
	const dir = fs.mkdtempSync(path.join(scratch, 'old-'));
	fs.writeFileSync(path.join(dir, 'pcbhub.db'), 'db');
	fs.writeFileSync(path.join(dir, 'pcbhub.db-wal'), 'wal');
	restore.migrateLegacyDatabase(dir);
	assert.equal(fs.readFileSync(path.join(dir, 'pcbgit.db'), 'utf8'), 'db');
	assert.equal(fs.readFileSync(path.join(dir, 'pcbgit.db-wal'), 'utf8'), 'wal');
	assert.ok(!fs.existsSync(path.join(dir, 'pcbhub.db')));
});

test('archives that could escape the data directory are refused', () => {
	const traversal = path.join(scratch, 'traversal.tar.gz');
	fs.mkdirSync(path.join(scratch, 'inner'), { recursive: true });
	fs.writeFileSync(path.join(scratch, 'evil.txt'), 'x');
	// -P keeps the leading ../ that tar would otherwise strip when creating.
	execFileSync('tar', ['-czPf', traversal, '-C', path.join(scratch, 'inner'), '../evil.txt']);
	assert.throws(() => restore.checkArchive(traversal), /Unsafe path/);

	const linked = makeArchive('link.tar.gz', (dir) => {
		fs.writeFileSync(path.join(dir, 'manifest.json'), '{}');
		fs.writeFileSync(path.join(dir, 'pcbgit.db'), '');
		fs.mkdirSync(path.join(dir, 'repos'));
		fs.symlinkSync('/etc', path.join(dir, 'repos', 'escape'));
		return ['manifest.json', 'pcbgit.db', 'repos'];
	});
	assert.throws(() => restore.checkArchive(linked), /links/);
});

test('archives that are not pcbgit snapshots are refused', () => {
	const stray = makeArchive('stray.tar.gz', (dir) => {
		fs.writeFileSync(path.join(dir, 'passwd'), 'x');
		return ['passwd'];
	});
	assert.throws(() => restore.checkArchive(stray), /Unexpected file/);

	const noDb = makeArchive('nodb.tar.gz', (dir) => {
		fs.writeFileSync(path.join(dir, 'manifest.json'), '{}');
		return ['manifest.json'];
	});
	assert.throws(() => restore.checkArchive(noDb), /missing/);

	const wrongFormat = makeArchive('wrong.tar.gz', (dir) => {
		fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ format: 'something-else' }));
		fs.writeFileSync(path.join(dir, 'pcbgit.db'), '');
		return ['manifest.json', 'pcbgit.db'];
	});
	assert.throws(() => restore.readManifest(wrongFormat), /Not a pcbgit snapshot/);

	const corruptDb = makeArchive('corrupt.tar.gz', (dir) => {
		fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ format: 'pcbgit-snapshot', version: 1 }));
		fs.writeFileSync(path.join(dir, 'pcbgit.db'), 'this is not sqlite');
		return ['manifest.json', 'pcbgit.db'];
	});
	const dest = fs.mkdtempSync(path.join(scratch, 'dest-'));
	assert.throws(() => restore.stageSnapshot(corruptDb, dest), /Database/);
	assert.equal(restore.pendingRestore(dest), null, 'a failed stage leaves nothing pending');
});

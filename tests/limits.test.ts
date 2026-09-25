/** Per-user limits (boards, storage, uploads and pushes per hour) and approval of new accounts. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pcbgit-limits-'));
process.env.PCBGIT_DATA_DIR = dataDir;

const { count, newId, now, run, setSetting } = await import('../src/lib/server/db/index.ts');
const auth = await import('../src/lib/server/auth.ts');
const projects = await import('../src/lib/server/projects.ts');
const limits = await import('../src/lib/server/limits.ts');
const { refusePush } = await import('../src/lib/server/githttp.ts');
const { commitFiles } = await import('../src/lib/server/git.ts');
const { repoPath } = await import('../src/lib/server/paths.ts');

/** Waits for the render worker, which clears and rewrites a commit's artifacts. */
async function renderQueueIdle() {
	const deadline = Date.now() + 30_000;
	while (count("SELECT COUNT(*) FROM render_jobs WHERE status IN ('queued','running')") && Date.now() < deadline) {
		await new Promise((resolve) => setTimeout(resolve, 60));
	}
}

after(async () => {
	await renderQueueIdle();
	fs.rmSync(dataDir, { recursive: true, force: true });
});

const user = auth.createUser({ username: 'maker', email: 'm@example.com', password: 'password123' });
const admin = auth.createUser({ username: 'boss', email: 'b@example.com', password: 'password123', role: 'admin' });
const fresh = () => auth.getUserById(user.id)!;
const MB = 1024 ** 2;

test('limits come from the instance defaults, a user can override them, and admins have none', () => {
	assert.deepEqual(limits.limitsFor(fresh()), { boards: null, storageBytes: null, writesPerHour: 30 }, 'defaults: no board or storage limit');

	setSetting('limit_boards', '5');
	setSetting('limit_storage_mb', '100');
	assert.deepEqual(limits.limitsFor(fresh()), { boards: 5, storageBytes: 100 * MB, writesPerHour: 30 });

	run('UPDATE users SET limit_boards = 2, limit_storage_mb = 0 WHERE id = ?', user.id);
	assert.deepEqual(limits.limitsFor(fresh()), { boards: 2, storageBytes: null, writesPerHour: 30 }, '0 overrides to no limit');

	assert.deepEqual(limits.limitsFor(admin), { boards: null, storageBytes: null, writesPerHour: null });
});

test('the board limit counts the boards a user owns', async () => {
	run('UPDATE users SET limit_boards = 1, limit_storage_mb = NULL WHERE id = ?', user.id);
	setSetting('limit_storage_mb', '0');
	await limits.checkNewBoard(user.id);
	await projects.createProject({ owner: fresh(), slug: 'first', name: 'First' });
	await assert.rejects(limits.checkNewBoard(user.id), (error: Error) => error instanceof limits.LimitError && /limit of 1 board/.test(error.message));
	await limits.checkNewBoard(admin.id);
});

test('storage counts repositories and rendered output, and refuses once it is full', async () => {
	const project = projects.getProject('maker', 'first')!;
	await commitFiles(repoPath('maker', 'first'), [{ path: 'board.kicad_pcb', data: Buffer.from('(kicad_pcb)') }], {
		message: 'first',
		authorName: 'Maker',
		authorEmail: 'm@example.com',
		branch: 'main'
	});
	await projects.syncCommits(project, 'maker');
	await renderQueueIdle();
	const before = await limits.storageUsed(user.id);
	assert.ok(before > 0, 'the repository is measured after a sync');

	// A render's output counts too: 2 MB of artifacts pushes the user past 1 MB.
	const commitId = projects.listProjectCommits(project.id)[0].id;
	run(
		`INSERT INTO artifacts (id, commit_id, kind, name, rel_path, ordinal, meta, size_bytes, created_at)
		 VALUES (?, ?, 'bom_csv', 'bom.csv', 'x/bom.csv', 0, '{}', ?, ?)`,
		newId(),
		commitId,
		2 * MB,
		now()
	);
	assert.equal(await limits.storageUsed(user.id), before + 2 * MB);

	run('UPDATE users SET limit_storage_mb = 1 WHERE id = ?', user.id);
	await assert.rejects(limits.checkStorage(user.id), /storage is full \(\d+ MB of 1 MB\)/);
	run('UPDATE users SET limit_storage_mb = 10 WHERE id = ?', user.id);
	await limits.checkStorage(user.id);
});

test('boards measured before sizes were tracked are measured on the first check', async () => {
	run('UPDATE projects SET repo_bytes = -1');
	assert.ok((await limits.storageUsed(user.id)) > 2 * MB);
	assert.equal(count('SELECT COUNT(*) FROM projects WHERE repo_bytes < 0'), 0);
});

test('uploads and pushes are limited per hour, and the window moves on', () => {
	setSetting('limit_writes_per_hour', '2');
	const start = 1_000_000;
	limits.takeWrite(fresh(), start);
	limits.takeWrite(fresh(), start + 1000);
	assert.throws(() => limits.takeWrite(fresh(), start + 2000), /Too many uploads and pushes \(limit: 2 per hour\). Try again in 60 minutes/);
	assert.throws(() => limits.checkWriteRate(fresh(), start + 2000), limits.LimitError);
	// An hour after the first one, one slot is free again.
	limits.takeWrite(fresh(), start + 60 * 60 * 1000);
	// Admins are never counted.
	for (let i = 0; i < 5; i++) limits.takeWrite(admin, start);
});

test('a refused push is an ERR line in git\'s ref advertisement', async () => {
	const response = refusePush('Storage   full');
	assert.equal(response.headers.get('content-type'), 'application/x-git-receive-pack-advertisement');
	assert.equal(await response.text(), '001f# service=git-receive-pack\n0000' + '0015ERR Storage full\n');
});

test('an account waiting for approval cannot sign in or push until approved', () => {
	const pending = auth.createUser({ username: 'newbie', email: 'n@example.com', password: 'password123', pending: true });
	assert.equal(pending.is_active, 0);
	assert.equal(pending.approved, 0);

	const session = auth.createSession(pending.id);
	assert.equal(auth.getSessionUser(session.id), null);
	const token = auth.createAccessToken(pending.id, 'laptop');
	assert.equal(auth.authenticateToken('newbie', token), null);

	run('UPDATE users SET approved = 1, is_active = 1 WHERE id = ?', pending.id);
	assert.equal(auth.getSessionUser(session.id)?.username, 'newbie');
	assert.equal(auth.authenticateToken('newbie', token)?.username, 'newbie');
});

test('sizes read like BODY_SIZE_LIMIT, and the free-disk minimum defaults to 1 GB', async () => {
	const { parseByteSize } = await import('../src/lib/server/bytes.ts');
	assert.equal(parseByteSize('2G'), 2 * 1024 ** 3);
	assert.equal(parseByteSize('500m'), 500 * MB);
	assert.equal(parseByteSize('1.5G'), 1.5 * 1024 ** 3);
	assert.equal(parseByteSize('4096'), 4096);
	assert.equal(parseByteSize('lots'), null);

	assert.equal(limits.minFreeDisk(undefined), 1024 ** 3);
	assert.equal(limits.minFreeDisk(''), 1024 ** 3, 'an empty setting keeps the default');
	assert.equal(limits.minFreeDisk('lots'), 1024 ** 3, 'an unreadable one too');
	assert.equal(limits.minFreeDisk('0'), 0, '0 turns it off');
});

test('below the free-disk minimum, writes are refused for everyone, admins included', async () => {
	const previous = process.env.PCBGIT_MIN_FREE_DISK;
	// More than any test machine has free.
	process.env.PCBGIT_MIN_FREE_DISK = '1000000G';
	try {
		await assert.rejects(limits.checkStorage(admin.id), /disk is almost full/);
		await assert.rejects(limits.checkNewBoard(user.id), limits.LimitError);
	} finally {
		if (previous === undefined) delete process.env.PCBGIT_MIN_FREE_DISK;
		else process.env.PCBGIT_MIN_FREE_DISK = previous;
	}
	await limits.checkStorage(admin.id);
});

/**
 * End-to-end test of the ingest pipeline: create a project, write a commit into
 * its bare repository, index it, and let the render worker process it.
 *
 * kicad-cli is not assumed to be present. Without it the worker still parses
 * board statistics and builds a BOM from the schematic, which is the degraded
 * mode this test pins down.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after, before } from 'node:test';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kupfergit-test-'));
process.env.KUPFERGIT_DATA_DIR = dataDir;
// Keep the test instance from creating the default admin with a weak password.
process.env.KUPFERGIT_ADMIN_PASSWORD = 'test-password-not-used';

const { all, count, get } = await import('../src/lib/server/db/index.ts');
const { createUser } = await import('../src/lib/server/auth.ts');
const { createProject, syncCommits, getProject, setProjectTags, toggleStar, browseProjects, ensureTag } =
	await import('../src/lib/server/projects.ts');
const { commitFiles } = await import('../src/lib/server/git.ts');
const { repoPath } = await import('../src/lib/server/paths.ts');
const { projectFiles } = await import('../scripts/fixtures/kicad.ts');

const SPEC = {
	name: 'testboard',
	title: 'Test Board',
	widthMm: 50,
	heightMm: 35,
	copperLayers: 2 as const,
	nets: ['GND', '+3V3', 'SDA'],
	parts: [
		{ ref: 'U1', value: 'ATmega328P', footprint: 'Package_QFP:TQFP-32', description: 'MCU', mpn: 'ATMEGA328P-AU', x: 110, y: 90, pads: 8 },
		{ ref: 'R1', value: '10k', footprint: 'Resistor_SMD:R_0603_1608Metric', description: 'Resistor', mpn: 'RC0603', x: 120, y: 90 },
		{ ref: 'R2', value: '10k', footprint: 'Resistor_SMD:R_0603_1608Metric', description: 'Resistor', mpn: 'RC0603', x: 124, y: 90 },
		{ ref: 'C1', value: '100n', footprint: 'Capacitor_SMD:C_0402_1005Metric', description: 'MLCC', x: 128, y: 95 }
	],
	readme: '# Test Board\n\nA fixture.',
	description: 'fixture',
	tags: ['ATmega'],
	license: 'MIT'
};

/** Waits for the in-process worker to finish everything it has queued. */
async function drainQueue(timeoutMs = 60_000) {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		const pending = count("SELECT COUNT(*) FROM render_jobs WHERE status IN ('queued','running')");
		if (pending === 0) return;
		if (Date.now() > deadline) throw new Error('Render queue did not drain in time');
		await new Promise((resolve) => setTimeout(resolve, 60));
	}
}

let projectId: string;
let userId: string;

before(async () => {
	// Tags are admin-managed: they must exist before a board can use them.
	ensureTag('ATmega', 'component', '#6ba4e8');
	ensureTag('2-layer', 'process');
	ensureTag('Breakout', 'domain');

	const user = createUser({ username: 'tester', email: 'tester@example.com', password: 'password123' });
	userId = user.id;

	const project = await createProject({
		owner: user,
		slug: 'testboard',
		name: 'Test Board',
		description: 'fixture',
		license: 'MIT',
		tags: ['ATmega', '2-layer']
	});
	projectId = project.id;

	await commitFiles(repoPath('tester', 'testboard'), projectFiles(SPEC), {
		message: 'Initial commit',
		authorName: 'Tester',
		authorEmail: 'tester@example.com',
		branch: 'main'
	});
	await syncCommits(project, 'tester');
	await drainQueue();
});

after(() => {
	fs.rmSync(dataDir, { recursive: true, force: true });
});

test('creating a project initialises a bare git repository', () => {
	const repo = repoPath('tester', 'testboard');
	assert.ok(fs.existsSync(repo), 'repository directory exists');
	assert.ok(fs.existsSync(path.join(repo, 'HEAD')), 'repository is a real git dir');
	assert.ok(fs.existsSync(path.join(repo, 'git-daemon-export-ok')), 'repository is exportable over HTTP');
});

test('syncCommits indexes the commit and points the project head at it', () => {
	const commits = all<{ id: string; sha: string; message: string }>(
		'SELECT id, sha, message FROM commits WHERE project_id = ?',
		projectId
	);
	assert.equal(commits.length, 1);
	assert.equal(commits[0].message, 'Initial commit');
	assert.match(commits[0].sha, /^[0-9a-f]{40}$/);

	const project = get<{ head_commit_id: string }>('SELECT head_commit_id FROM projects WHERE id = ?', projectId);
	assert.equal(project?.head_commit_id, commits[0].id);
});

test('the worker records board statistics parsed from the .kicad_pcb', () => {
	const commit = get<{
		render_status: string;
		board_width: number;
		board_height: number;
		layer_count: number;
		net_count: number;
		board_bbox: string;
		board_name: string;
	}>('SELECT * FROM commits WHERE project_id = ?', projectId)!;

	assert.equal(commit.render_status, 'success', 'render completed');
	assert.equal(commit.board_width, 50);
	assert.equal(commit.board_height, 35);
	assert.equal(commit.layer_count, 2);
	assert.equal(commit.net_count, 3);
	assert.equal(commit.board_name, 'Test Board');
	assert.deepEqual(JSON.parse(commit.board_bbox), { minX: 100, minY: 80, maxX: 150, maxY: 115 });
});

test('the worker builds a grouped BOM even without kicad-cli', () => {
	const commit = get<{ id: string }>('SELECT id FROM commits WHERE project_id = ?', projectId)!;
	const bom = all<{ refs: string; value: string; quantity: number; mpn: string }>(
		'SELECT refs, value, quantity, mpn FROM bom_items WHERE commit_id = ? ORDER BY ordinal',
		commit.id
	);

	assert.equal(bom.length, 3, 'identical resistors collapse into one line');
	const resistors = bom.find((line) => line.value === '10k')!;
	assert.equal(resistors.quantity, 2);
	assert.equal(resistors.refs, 'R1, R2');
	assert.equal(resistors.mpn, 'RC0603');
	// The power symbol must not reach the BOM.
	assert.ok(!bom.some((line) => line.refs.includes('#PWR')));
});

test('a second commit produces a second version and re-renders', async () => {
	const project = getProject('tester', 'testboard')!;
	const changed = {
		...SPEC,
		widthMm: 60,
		parts: [...SPEC.parts, { ref: 'D1', value: 'red', footprint: 'LED_SMD:LED_0603_1608Metric', description: 'LED', x: 132, y: 100 }]
	};

	await commitFiles(repoPath('tester', 'testboard'), projectFiles(changed), {
		message: 'Widen board, add status LED',
		authorName: 'Tester',
		authorEmail: 'tester@example.com',
		branch: 'main'
	});
	await syncCommits(project, 'tester');
	await drainQueue();

	const commits = all<{ id: string; board_width: number; render_status: string }>(
		'SELECT id, board_width, render_status FROM commits WHERE project_id = ? ORDER BY committed_at DESC, rowid DESC',
		projectId
	);
	assert.equal(commits.length, 2, 'history keeps both versions');
	assert.equal(commits[0].board_width, 60, 'newest version reflects the wider board');
	assert.equal(commits[1].board_width, 50, 'the old version keeps its own statistics');
	assert.equal(commits[0].render_status, 'success');

	const newBom = count('SELECT COUNT(*) FROM bom_items WHERE commit_id = ?', commits[0].id);
	const oldBom = count('SELECT COUNT(*) FROM bom_items WHERE commit_id = ?', commits[1].id);
	assert.equal(newBom, oldBom + 1, 'the added LED shows up as a new BOM line');
});

test('a commit with no KiCad project fails the render with a clear message', async () => {
	const user = get<{ id: string }>('SELECT id FROM users WHERE username = ?', 'tester')!;
	const { createProject: create } = await import('../src/lib/server/projects.ts');
	const { getUserById } = await import('../src/lib/server/auth.ts');

	const empty = await create({
		owner: getUserById(user.id)!,
		slug: 'notaboard',
		name: 'Not A Board'
	});
	await commitFiles(repoPath('tester', 'notaboard'), [{ path: 'notes.txt', data: Buffer.from('hello') }], {
		message: 'Just a text file',
		authorName: 'Tester',
		authorEmail: 'tester@example.com',
		branch: 'main'
	});
	await syncCommits(empty, 'tester');
	await drainQueue();

	const commit = get<{ render_status: string }>('SELECT render_status FROM commits WHERE project_id = ?', empty.id)!;
	assert.equal(commit.render_status, 'failed');

	const job = get<{ error: string }>('SELECT error FROM render_jobs WHERE project_id = ?', empty.id)!;
	assert.match(job.error, /No KiCad project found/);
});

test('private boards are hidden from anonymous browsing but visible to their owner', async () => {
	const { getUserById } = await import('../src/lib/server/auth.ts');
	const owner = getUserById(userId)!;
	const secret = await createProject({
		owner,
		slug: 'secret',
		name: 'Secret Board',
		visibility: 'private'
	});

	const anonymous = browseProjects({ viewer: null });
	assert.ok(!anonymous.projects.some((p) => p.id === secret.id), 'hidden from signed-out visitors');

	const asOwner = browseProjects({ viewer: owner });
	assert.ok(asOwner.projects.some((p) => p.id === secret.id), 'visible to the owner');

	const other = createUser({ username: 'stranger', email: 'stranger@example.com', password: 'password123' });
	const asStranger = browseProjects({ viewer: other });
	assert.ok(!asStranger.projects.some((p) => p.id === secret.id), 'hidden from other users');
});

test('boards can only use existing tags; unknown tags are never created', () => {
	const before = count('SELECT COUNT(*) FROM tags');
	setProjectTags(projectId, ['atmega', 'Made-Up-Tag', '2-layer']);

	assert.equal(count('SELECT COUNT(*) FROM tags'), before, 'no tag was created');
	const attached = all<{ slug: string; color: string }>(
		'SELECT t.slug, t.color FROM project_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.project_id = ? ORDER BY t.slug',
		projectId
	);
	assert.deepEqual(attached.map((tag) => tag.slug), ['2-layer', 'atmega']);
	assert.equal(attached.find((tag) => tag.slug === 'atmega')?.color, '#6ba4e8');
	// A tag created without a colour gets its category default, a real hex value.
	assert.match(attached.find((tag) => tag.slug === '2-layer')!.color, /^#[0-9a-f]{6}$/);
});

test('tags and stars attach to a project and drive filtering', () => {
	setProjectTags(projectId, ['ATmega', '2-layer', 'Breakout']);
	const tagged = browseProjects({ viewer: null, tags: ['atmega'] });
	assert.ok(tagged.projects.some((p) => p.id === projectId));

	const missing = browseProjects({ viewer: null, tags: ['fpga'] });
	assert.equal(missing.projects.length, 0);

	assert.equal(toggleStar(userId, projectId), true, 'first toggle stars');
	assert.equal(count('SELECT COUNT(*) FROM stars WHERE project_id = ?', projectId), 1);
	assert.equal(toggleStar(userId, projectId), false, 'second toggle unstars');
	assert.equal(count('SELECT COUNT(*) FROM stars WHERE project_id = ?', projectId), 0);
});

test('deleting a project removes its repository and cascades its rows', async () => {
	const { deleteProject } = await import('../src/lib/server/projects.ts');
	const project = getProject('tester', 'notaboard')!;
	const repo = repoPath('tester', 'notaboard');
	assert.ok(fs.existsSync(repo));

	await deleteProject(project, userId);

	assert.ok(!fs.existsSync(repo), 'bare repository is gone');
	assert.equal(count('SELECT COUNT(*) FROM projects WHERE id = ?', project.id), 0);
	assert.equal(count('SELECT COUNT(*) FROM commits WHERE project_id = ?', project.id), 0);
});

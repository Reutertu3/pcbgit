/** Collaborators: who may see and edit a board, and who hears about new versions and comments. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pcbgit-collaborators-'));
process.env.PCBGIT_DATA_DIR = dataDir;

const { count } = await import('../src/lib/server/db/index.ts');
const { createUser } = await import('../src/lib/server/auth.ts');
const projects = await import('../src/lib/server/projects.ts');
const comments = await import('../src/lib/server/comments.ts');
const notifications = await import('../src/lib/server/notifications.ts');
const { commitFiles } = await import('../src/lib/server/git.ts');
const { repoPath } = await import('../src/lib/server/paths.ts');

after(async () => {
	// The worker renders what syncCommits queued; let it finish before the data dir goes.
	const deadline = Date.now() + 30_000;
	while (count("SELECT COUNT(*) FROM render_jobs WHERE status IN ('queued','running')") && Date.now() < deadline) {
		await new Promise((resolve) => setTimeout(resolve, 60));
	}
	fs.rmSync(dataDir, { recursive: true, force: true });
});

const owner = createUser({ username: 'owner', email: 'o@example.com', password: 'password123' });
const carol = createUser({ username: 'carol', email: 'c@example.com', password: 'password123' });
const stranger = createUser({ username: 'stranger', email: 's@example.com', password: 'password123' });
const admin = createUser({ username: 'root', email: 'r@example.com', password: 'password123', role: 'admin' });
const project = await projects.createProject({ owner, slug: 'board', name: 'Board', visibility: 'private' });

async function push(message: string, files: string[]) {
	await commitFiles(
		repoPath('owner', 'board'),
		files.map((name) => ({ path: name, data: Buffer.from(name) })),
		{ message, authorName: 'Someone', authorEmail: 'someone@example.com', branch: 'main' }
	);
}

test('adding a collaborator is refused for unknown users, the owner and duplicates', () => {
	assert.equal(projects.addCollaborator(project, 'nobody', owner.id), 'collaborators.error.noUser');
	assert.equal(projects.addCollaborator(project, 'owner', owner.id), 'collaborators.error.owner');
	assert.equal(projects.addCollaborator(project, 'Carol', owner.id), null, 'usernames match case-insensitively');
	assert.equal(projects.addCollaborator(project, 'carol', owner.id), 'collaborators.error.already');
	assert.deepEqual(
		projects.listCollaborators(project.id).map((c) => c.username),
		['carol']
	);
});

test('a collaborator can see and edit a private board, but not own it', () => {
	assert.ok(projects.canView(project, carol));
	assert.ok(projects.canEdit(project, carol));
	assert.ok(!projects.isOwner(project, carol));
	assert.ok(projects.isOwner(project, owner));
	assert.ok(projects.isOwner(project, admin));

	assert.ok(!projects.canView(project, stranger));
	assert.ok(!projects.canEdit(project, stranger));
	assert.ok(!projects.canView(project, null));
});

test('your own list holds collaborations, other people only see what someone owns', () => {
	const own = projects.browseProjects({ viewer: carol, owner: 'carol', includeCollaborations: true });
	assert.deepEqual(own.projects.map((p) => p.slug), ['board']);
	assert.equal(projects.browseProjects({ viewer: carol, owner: 'carol' }).total, 0);
	assert.equal(projects.browseProjects({ viewer: stranger, owner: 'owner' }).total, 0, 'still private');
});

test('new versions notify the owner and collaborators, never whoever pushed', async () => {
	await push('First', ['a.txt']);
	await projects.syncCommits(project, 'owner', carol.id);
	assert.equal(notifications.unreadCount(carol.id), 0);
	const [first] = notifications.listNotifications(owner.id);
	assert.equal(first.kind, 'version');
	assert.equal(first.actor, 'carol');
	assert.equal(first.version_count, 1);
	assert.equal(first.excerpt, 'First');

	// Two commits in one push become one notification pointing at the newest.
	await push('Second', ['b.txt']);
	await push('Third', ['c.txt']);
	await projects.syncCommits(project, 'owner', owner.id);
	const [latest] = notifications.listNotifications(carol.id);
	assert.equal(latest.version_count, 2);
	assert.equal(latest.excerpt, 'Third');
	assert.equal(notifications.unreadCount(owner.id), 1, 'the owner pushed it themselves');

	// A re-sync without an actor only catches up; it notifies nobody.
	await push('Fourth', ['d.txt']);
	await projects.syncCommits(project, 'owner');
	assert.equal(notifications.unreadCount(carol.id), 1);
	assert.equal(notifications.notificationCount(owner.id), 1);
});

test('collaborators hear about comments too', () => {
	comments.addComment(project.id, owner.id, 'Check the footprint of U3.');
	assert.deepEqual(
		notifications.listNotifications(carol.id).map((n) => [n.kind, n.actor]),
		[
			['comment', 'owner'],
			['version', 'owner']
		]
	);
});

test('removing a collaborator ends their access and hides the board’s notifications', () => {
	projects.removeCollaborator(project, carol.id, owner.id);
	assert.ok(!projects.canView(project, carol));
	assert.ok(!projects.canEdit(project, carol));
	assert.equal(notifications.unreadCount(carol.id), 0);
	assert.equal(notifications.listNotifications(carol.id).length, 0);
});

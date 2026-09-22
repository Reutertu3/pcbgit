/** Comment notifications: who gets one, read state, cleanup on delete, private boards. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pcbgit-notifications-'));
process.env.PCBGIT_DATA_DIR = dataDir;

const { createUser } = await import('../src/lib/server/auth.ts');
const { createProject, updateProject } = await import('../src/lib/server/projects.ts');
const comments = await import('../src/lib/server/comments.ts');
const notifications = await import('../src/lib/server/notifications.ts');

after(() => fs.rmSync(dataDir, { recursive: true, force: true }));

const owner = createUser({ username: 'owner', email: 'o@example.com', password: 'password123' });
const alice = createUser({ username: 'alice', email: 'a@example.com', password: 'password123' });
const bob = createUser({ username: 'bob', email: 'b@example.com', password: 'password123' });
const project = await createProject({ owner, slug: 'board', name: 'Board' });

const kinds = (userId: string) => notifications.listNotifications(userId).map((n) => [n.kind, n.actor]);

test('the owner is notified of comments, never of their own', () => {
	comments.addComment(project.id, owner.id, 'Rev B is up.');
	assert.equal(notifications.unreadCount(owner.id), 0);

	const root = comments.addComment(project.id, alice.id, 'Why 0402 here?');
	assert.deepEqual(kinds(owner.id), [['comment', 'alice']]);
	assert.equal(notifications.listNotifications(owner.id)[0].excerpt, 'Why 0402 here?');
	assert.equal(notifications.unreadCount(alice.id), 0);

	// The thread author hears about replies; the owner gets one entry, not two.
	comments.addComment(project.id, bob.id, 'Space on the bottom.', root.id);
	assert.deepEqual(kinds(alice.id), [['reply', 'bob']]);
	assert.equal(notifications.unreadCount(owner.id), 2);
	assert.equal(notifications.unreadCount(bob.id), 0);
});

test('mark one and mark all as read, only for the recipient', () => {
	const [latest] = notifications.listNotifications(owner.id);
	notifications.markRead(alice.id, latest.id);
	assert.equal(notifications.unreadCount(owner.id), 2, 'another user cannot mark it');

	notifications.markRead(owner.id, latest.id);
	assert.equal(notifications.unreadCount(owner.id), 1);
	assert.ok(notifications.listNotifications(owner.id)[0].read_at);

	notifications.markAllRead(owner.id);
	assert.equal(notifications.unreadCount(owner.id), 0);
	assert.equal(notifications.unreadCount(alice.id), 1, 'other users are untouched');
});

test('deleting a comment removes its notifications', () => {
	const [thread] = comments.listThreads(project.id).filter((t) => t.username === 'alice');
	// Soft delete: the thread keeps a placeholder because it has a reply.
	comments.removeComment(project.id, thread.id, alice, owner.id);
	assert.deepEqual(kinds(owner.id), [['comment', 'bob']]);

	const reply = thread.replies[0];
	comments.removeComment(project.id, reply.id, bob, owner.id);
	assert.equal(notifications.listNotifications(owner.id).length, 0);
	assert.equal(notifications.listNotifications(alice.id).length, 0);
});

test('notifications from a board that turned private are hidden from non-owners', () => {
	const root = comments.addComment(project.id, alice.id, 'Hello');
	comments.addComment(project.id, bob.id, 'Hi', root.id);
	assert.equal(notifications.unreadCount(alice.id), 1);

	updateProject(project.id, { visibility: 'private' });
	assert.equal(notifications.unreadCount(alice.id), 0);
	assert.equal(notifications.listNotifications(alice.id).length, 0);
	assert.equal(notifications.unreadCount(owner.id), 2, 'the owner still sees them');
});

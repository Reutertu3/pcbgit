/** Threaded comments: one level of replies, placeholders for deleted threads. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pcbgit-comments-'));
process.env.PCBGIT_DATA_DIR = dataDir;

const { createUser } = await import('../src/lib/server/auth.ts');
const { createProject } = await import('../src/lib/server/projects.ts');
const comments = await import('../src/lib/server/comments.ts');

after(() => fs.rmSync(dataDir, { recursive: true, force: true }));

const owner = createUser({ username: 'owner', email: 'o@example.com', password: 'password123' });
const alice = createUser({ username: 'alice', email: 'a@example.com', password: 'password123' });
const bob = createUser({ username: 'bob', email: 'b@example.com', password: 'password123' });
const project = await createProject({ owner, slug: 'threads', name: 'Threads' });
const other = await createProject({ owner, slug: 'other', name: 'Other' });

test('replies attach to their thread; a reply to a reply joins the same thread', () => {
	const root = comments.addComment(project.id, alice.id, 'Why 0402 here?');
	const reply = comments.addComment(project.id, bob.id, 'Space on the bottom side.', root.id);
	const nested = comments.addComment(project.id, alice.id, '@bob makes sense', reply.id);

	assert.equal(reply.threadId, root.id);
	assert.equal(nested.threadId, root.id, 'replying to a reply stays one level deep');

	const [thread] = comments.listThreads(project.id);
	assert.equal(thread.body, 'Why 0402 here?');
	assert.deepEqual(thread.replies.map((r) => r.username), ['bob', 'alice']);
	assert.equal(comments.countComments(project.id), 3);
});

test('replies cannot point into another board or at a missing comment', () => {
	const [thread] = comments.listThreads(project.id);
	assert.throws(() => comments.addComment(other.id, bob.id, 'sneaky', thread.id), /no longer exists/);
	assert.throws(() => comments.addComment(project.id, bob.id, 'ghost', 'does-not-exist'), /no longer exists/);
	assert.throws(() => comments.addComment(project.id, bob.id, '   '), /Write something/);
	assert.throws(() => comments.addComment(project.id, bob.id, 'x'.repeat(4001)), /too long/);
});

test('deleting a comment with replies leaves a placeholder; the thread still reads', () => {
	const [thread] = comments.listThreads(project.id);
	assert.throws(() => comments.removeComment(project.id, thread.id, bob), /own comments/);

	assert.equal(comments.removeComment(project.id, thread.id, alice), true);
	const [after] = comments.listThreads(project.id);
	assert.equal(after.deleted, true);
	assert.equal(after.body, '');
	assert.equal(after.username, '', 'the placeholder does not reveal its author');
	assert.equal(after.replies.length, 2);
	assert.equal(comments.countComments(project.id), 2, 'placeholders are not counted');
});

test('removing the last reply under a placeholder removes the placeholder too', () => {
	const [thread] = comments.listThreads(project.id);
	// Board owners cannot delete other people's comments; admins can.
	assert.throws(() => comments.removeComment(project.id, thread.replies[0].id, owner), /own comments/);
	for (const reply of thread.replies) comments.removeComment(project.id, reply.id, { id: 'admin-id', role: 'admin' });
	assert.deepEqual(comments.listThreads(project.id), []);
	assert.equal(comments.countComments(project.id), 0);
});

test('a comment without replies is removed outright', () => {
	const lone = comments.addComment(project.id, bob.id, 'Nice board');
	comments.removeComment(project.id, lone.id, { id: 'admin-id', role: 'admin' });
	assert.deepEqual(comments.listThreads(project.id), []);
});

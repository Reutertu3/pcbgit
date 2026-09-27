/** Tag counts on the front page follow its filters, like the board list. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pcbgit-browsetags-'));
process.env.PCBGIT_DATA_DIR = dataDir;
after(() => fs.rmSync(dataDir, { recursive: true, force: true }));

const auth = await import('../src/lib/server/auth.ts');
const projects = await import('../src/lib/server/projects.ts');

const ada = auth.createUser({ username: 'ada', email: 'a@example.com', password: 'password123' });
const bob = auth.createUser({ username: 'bob', email: 'b@example.com', password: 'password123' });
projects.ensureTag('ESP32', 'component');
projects.ensureTag('USB-C', 'interface');

const board = (owner: typeof ada, slug: string, tags: string[], visibility: 'public' | 'private' = 'public') =>
	projects.createProject({ owner, slug, name: slug, tags, visibility });
await board(ada, 'one', ['esp32', 'usb-c']);
await board(ada, 'two', ['esp32']);
await board(bob, 'three', ['esp32', 'usb-c']);
await board(bob, 'secret', ['esp32'], 'private');

const counts = (query: Parameters<typeof projects.browseTagCounts>[0]) => Object.fromEntries(projects.browseTagCounts(query));

test('without filters, every public board counts', () => {
	assert.deepEqual(counts({}), { esp32: 3, 'usb-c': 2 });
});

test('filtering by author counts only that author\'s boards', () => {
	assert.deepEqual(counts({ owner: 'ada' }), { esp32: 2, 'usb-c': 1 });
	assert.deepEqual(counts({ owner: 'bob' }), { esp32: 1, 'usb-c': 1 }, 'the private board is not counted');
});

test('with a tag selected, the others count what adding them would leave', () => {
	assert.deepEqual(counts({ tags: ['usb-c'] }), { esp32: 2, 'usb-c': 2 });
	assert.deepEqual(counts({ owner: 'ada', tags: ['usb-c'] }), { esp32: 1, 'usb-c': 1 });
});

test('the owner sees their private board counted, as in their list', () => {
	assert.deepEqual(counts({ viewer: auth.getUserById(bob.id), owner: 'bob' }), { esp32: 2, 'usb-c': 1 });
});

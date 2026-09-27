/** Tag requests: users ask, admins approve or decline, everyone who asked hears back. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test, { after } from 'node:test';

import { SCHEMA_SQL } from '../src/lib/server/db/schema.ts';
import { normalizeTagName, sameTag } from '../src/lib/tagname.ts';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pcbgit-tagrequests-'));
process.env.PCBGIT_DATA_DIR = dataDir;
after(() => fs.rmSync(dataDir, { recursive: true, force: true }));

// An instance from before tag requests: notifications without the tag kinds.
{
	const old = new DatabaseSync(path.join(dataDir, 'pcbgit.db'));
	old.exec(SCHEMA_SQL);
	old.exec(`DROP TABLE notifications;
		CREATE TABLE notifications (
		  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		  kind TEXT NOT NULL CHECK (kind IN ('comment','reply','version','signup')),
		  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
		  comment_id TEXT REFERENCES comments(id) ON DELETE CASCADE, commit_id TEXT REFERENCES commits(id) ON DELETE CASCADE,
		  version_count INTEGER NOT NULL DEFAULT 1, actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
		  created_at INTEGER NOT NULL, read_at INTEGER, UNIQUE (user_id, comment_id));`);
	old.exec(`INSERT INTO users (id, username, email, password_hash, role, created_at, updated_at) VALUES
		  ('u0','root','r@example.com','x','admin',0,0), ('u9','newbie','n@example.com','x','user',1,1);
		INSERT INTO notifications (id, user_id, kind, actor_id, created_at) VALUES ('n1','u0','signup','u9',1);`);
	old.close();
}

const { count, get } = await import('../src/lib/server/db/index.ts');
const auth = await import('../src/lib/server/auth.ts');
const projects = await import('../src/lib/server/projects.ts');
const requests = await import('../src/lib/server/tagrequests.ts');
const notifications = await import('../src/lib/server/notifications.ts');

const admin = auth.getUserById('u0')!;
const ada = auth.createUser({ username: 'ada', email: 'a@example.com', password: 'password123' });
const bob = auth.createUser({ username: 'bob', email: 'b@example.com', password: 'password123' });
projects.ensureTag('USB-C', 'interface');
const board = await projects.createProject({ owner: ada, slug: 'charger', name: 'Charger' });
const kinds = (userId: string) => notifications.listNotifications(userId).map((n) => n.kind);

test('the notifications table gains the tag kinds, keeping its rows', () => {
	assert.match(get<{ sql: string }>("SELECT sql FROM sqlite_master WHERE name = 'notifications'")!.sql, /'tag_decision'/);
	assert.deepEqual(kinds('u0'), ['signup']);
});

test('names compare without case, spaces or punctuation', () => {
	assert.equal(normalizeTagName('ESP32-S3'), normalizeTagName('esp32 s3'));
	assert.equal(normalizeTagName('USBC'), 'usbc');
	assert.equal(sameTag([{ name: 'USB-C', slug: 'usb-c' }], 'usb c')?.name, 'USB-C');
	assert.equal(sameTag([{ name: 'USB-C', slug: 'usb-c' }], 'USB-A'), undefined);
});

test('another spelling of an existing tag is refused, naming it', () => {
	assert.throws(() => requests.requestTag({ user: ada, name: 'USBC', category: 'interface' }), /USB-C already exists/);
	assert.throws(() => requests.requestTag({ user: ada, name: '--', category: 'interface' }), requests.TagRequestError);
	assert.throws(() => requests.requestTag({ user: ada, name: 'CAN FD', category: 'nope' }), requests.TagRequestError);
});

let requestId = '';
test('a request notifies the admins; the same tag asked again joins it', () => {
	const first = requests.requestTag({ user: ada, name: 'ESP32-S3', category: 'component', note: 'Common MCU', project: board });
	assert.equal(first.joined, false);
	requestId = first.id;
	assert.deepEqual(kinds(admin.id), ['tag_request', 'signup']);
	assert.equal(notifications.listNotifications(admin.id)[0].tag_name, 'ESP32-S3');
	assert.equal(notifications.listNotifications(admin.id)[0].excerpt, 'Common MCU');
	assert.deepEqual(kinds(ada.id), [], 'a user never sees request notifications');

	const second = requests.requestTag({ user: bob, name: 'esp32s3', category: 'component', project: board });
	assert.deepEqual([second.joined, second.id, second.name], [true, requestId, 'ESP32-S3']);
	assert.equal(count("SELECT COUNT(*) FROM tag_requests WHERE status = 'open'"), 1);
	assert.equal(count('SELECT COUNT(*) FROM tag_request_users WHERE project_id IS NOT NULL'), 1, "bob cannot tag ada's board");
	assert.throws(() => requests.requestTag({ user: bob, name: 'ESP32 S3', category: 'component' }), /already asked/);
	assert.deepEqual(requests.listOpenTagRequests()[0].people.map((person) => ({ ...person })), [
		{ username: 'ada', board: 'ada/charger' },
		{ username: 'bob', board: null }
	]);
});

test('one person has at most five open requests; admins have no limit', () => {
	for (const name of ['CAN', 'I2S', 'LoRa', 'Zigbee']) requests.requestTag({ user: bob, name, category: 'interface' });
	assert.throws(() => requests.requestTag({ user: bob, name: 'Thread', category: 'interface' }), /5 open requests/);
	requests.requestTag({ user: admin, name: 'Thread', category: 'interface' });
});

test('approving creates the tag, tags the board it was asked for from, and tells everyone who asked', () => {
	const unread = notifications.unreadCount(admin.id);
	const result = requests.approveTagRequest(requestId, admin, { name: 'ESP32-S3', category: 'component', color: '#6ba4e8' });
	assert.equal(result.name, 'ESP32-S3');
	assert.deepEqual(
		projects.getProject('ada', 'charger')!.tags.map((tag) => tag.slug),
		['esp32-s3']
	);
	assert.equal(kinds(ada.id)[0], 'tag_decision');
	assert.equal(notifications.listNotifications(bob.id)[0].tag_status, 'approved');
	assert.equal(notifications.unreadCount(admin.id), unread - 1, "the admins' notice of it is marked read");
	assert.equal(requests.listOwnTagRequests(ada.id)[0].tag_slug, 'esp32-s3');
	assert.throws(() => requests.approveTagRequest(requestId, admin, { name: 'x', category: 'component', color: '' }), /already decided/);
});

test('declining tells whoever asked, with the reason', () => {
	const lora = requests.listOpenTagRequests().find((request) => request.name === 'LoRa')!;
	requests.rejectTagRequest(lora.id, admin, 'Use RF');
	const note = notifications.listNotifications(bob.id)[0];
	assert.deepEqual([note.kind, note.tag_status, note.excerpt], ['tag_decision', 'rejected', 'Use RF']);
	assert.equal(requests.listOwnTagRequests(bob.id).find((r) => r.name === 'LoRa')!.reason, 'Use RF');
	// A declined name can be asked for again.
	requests.requestTag({ user: ada, name: 'LoRa', category: 'interface' });
});

test('deleting a category moves its open requests to the fallback', () => {
	const { id } = projects.createTagCategory('Radio', '#82b4c8') as { id: string };
	requests.requestTag({ user: ada, name: 'NB-IoT', category: id });
	projects.deleteTagCategory(id);
	assert.equal(requests.listOpenTagRequests().find((request) => request.name === 'NB-IoT')!.category, projects.FALLBACK_CATEGORY);
});

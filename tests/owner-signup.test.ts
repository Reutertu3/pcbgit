/** The protected owner account, and notifications to admins about new accounts. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test, { after } from 'node:test';

import { SCHEMA_SQL } from '../src/lib/server/db/schema.ts';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pcbgit-owner-'));
process.env.PCBGIT_DATA_DIR = dataDir;
process.env.PCBGIT_ADMIN_USER = 'chief';
after(() => fs.rmSync(dataDir, { recursive: true, force: true }));

// An instance from before sign-up notifications: every notification needed a board.
{
	const old = new DatabaseSync(path.join(dataDir, 'pcbgit.db'));
	old.exec(SCHEMA_SQL);
	old.exec(`DROP TABLE notifications;
		CREATE TABLE notifications (
		  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		  kind TEXT NOT NULL CHECK (kind IN ('comment','reply','version')),
		  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
		  comment_id TEXT REFERENCES comments(id) ON DELETE CASCADE, commit_id TEXT REFERENCES commits(id) ON DELETE CASCADE,
		  version_count INTEGER NOT NULL DEFAULT 1, actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
		  created_at INTEGER NOT NULL, read_at INTEGER, UNIQUE (user_id, comment_id));`);
	old.exec(`INSERT INTO users (id, username, email, password_hash, role, created_at, updated_at) VALUES
		  ('u1','first','f@example.com','x','admin',0,0), ('u2','chief','c@example.com','x','admin',5,5), ('u3','bob','b@example.com','x','user',9,9);
		INSERT INTO projects (id, owner_id, slug, name, created_at, updated_at) VALUES ('p1','u3','board','Board',0,0);
		INSERT INTO commits (id, project_id, sha, branch, message, author_name, author_email, committed_at, created_at)
		  VALUES ('c1','p1','abc1234','main','first version','Bob','b@example.com',0,0);
		INSERT INTO notifications (id, user_id, kind, project_id, commit_id, actor_id, created_at) VALUES ('n1','u2','version','p1','c1','u3',1);`);
	old.close();
}

const { count, get, run } = await import('../src/lib/server/db/index.ts');
const { bootstrap } = await import('../src/lib/server/bootstrap.ts');
const auth = await import('../src/lib/server/auth.ts');
const notifications = await import('../src/lib/server/notifications.ts');
const { actions } = await import('../src/routes/admin/users/+page.server.ts');

bootstrap();
const first = auth.getUserById('u1')!;
const chief = auth.getUserById('u2')!;
const bob = auth.getUserById('u3')!;

/** Calls an admin/users form action as `actor`, the way a posted form would. */
async function act(name: keyof typeof actions, actor: typeof first, fields: Record<string, string>) {
	const body = new FormData();
	for (const [key, value] of Object.entries(fields)) body.set(key, value);
	const request = new Request('http://localhost/admin/users', { method: 'POST', body });
	return (actions[name] as any)({ request, locals: { user: actor, locale: 'en' } });
}

test('the old notifications table is rebuilt for sign-ups, keeping its rows', () => {
	assert.equal(count('SELECT COUNT(*) FROM notifications'), 1);
	assert.match(get<{ sql: string }>("SELECT sql FROM sqlite_master WHERE name = 'notifications'")!.sql, /'signup'/);
	assert.equal(notifications.listNotifications('u2')[0].kind, 'version');
});

test('the owner is the admin named in .env, set once at boot', () => {
	assert.equal(chief.is_owner, 1);
	assert.equal(count('SELECT COUNT(*) FROM users WHERE is_owner = 1'), 1);
});

test('other admins cannot demote, disable, delete or reset the owner', async () => {
	for (const [name, fields] of [
		['setRole', { id: chief.id, role: 'user' }],
		['toggleActive', { id: chief.id }],
		['delete', { id: chief.id }],
		['resetPassword', { id: chief.id, password: 'taken-over-123' }]
	] as const) {
		const result = await act(name, first, fields);
		assert.equal(result?.status, 403, `${name} must be refused`);
	}
	const after = auth.getUserById(chief.id)!;
	assert.equal(after.role, 'admin');
	assert.equal(after.is_active, 1);
	assert.equal(after.password_hash, chief.password_hash);

	// Not even the owner demotes themselves; resetting their own password is fine.
	assert.equal((await act('setRole', chief, { id: chief.id, role: 'user' }))?.status, 403);
	assert.equal((await act('resetPassword', chief, { id: chief.id, password: 'new-owner-pass-1' }))?.success, true);

	// Other admins stay as manageable as before.
	assert.equal((await act('setRole', chief, { id: first.id, role: 'user' }))?.success, true);
	assert.equal(auth.getUserById(first.id)!.role, 'user');
	run("UPDATE users SET role = 'admin' WHERE id = ?", first.id);
});

test('admins are told about new accounts, and whether they wait for approval', async () => {
	const newbie = auth.createUser({ username: 'newbie', email: 'n@example.com', password: 'password123', pending: true });
	notifications.notifyForSignup(newbie.id);

	for (const admin of [first, chief]) {
		const [latest] = notifications.listNotifications(admin.id);
		assert.deepEqual([latest.kind, latest.actor, Boolean(latest.pending)], ['signup', 'newbie', true]);
	}
	assert.equal(notifications.listNotifications(bob.id).length, 0, 'users hear nothing about sign-ups');

	run('UPDATE users SET approved = 1, is_active = 1 WHERE id = ?', newbie.id);
	assert.equal(Boolean(notifications.listNotifications(chief.id)[0].pending), false);

	// A rejected (deleted) account takes its notifications with it.
	const before = notifications.unreadCount(chief.id);
	assert.equal((await act('delete', chief, { id: newbie.id }))?.success, true);
	assert.equal(notifications.unreadCount(chief.id), before - 1);
	assert.equal(count("SELECT COUNT(*) FROM notifications WHERE kind = 'signup'"), 0, 'not even hidden rows are left');
});

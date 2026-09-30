/** Registration against bots, without a CAPTCHA: a honeypot, a limit per address, a cap on waiting accounts. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pcbgit-registration-'));
process.env.PCBGIT_DATA_DIR = dataDir;
after(() => fs.rmSync(dataDir, { recursive: true, force: true }));

const { count, run } = await import('../src/lib/server/db/index.ts');
const auth = await import('../src/lib/server/auth.ts');
const guard = await import('../src/lib/server/loginguard.ts');
const { actions } = await import('../src/routes/register/+page.server.ts');

// An admin exists, so new accounts wait for approval (the default).
auth.createUser({ username: 'boss', email: 'boss@example.com', password: 'password123', role: 'admin' });

let serial = 0;
/** Posts the registration form from `address`, the way a browser would. */
async function register(address: string, extra: Record<string, string> = {}) {
	serial += 1;
	const body = new FormData();
	for (const [key, value] of Object.entries({ username: `maker${serial}`, email: `m${serial}@example.com`, password: 'password123', confirm: 'password123', ...extra })) {
		body.set(key, value);
	}
	const request = new Request('http://localhost/register', { method: 'POST', body });
	return (actions.default as any)({
		request,
		cookies: { set() {} },
		url: new URL('http://localhost/register'),
		locals: { user: null, locale: 'en' },
		getClientAddress: () => address
	});
}
const users = () => count('SELECT COUNT(*) FROM users');

test('a bot that fills the hidden field gets the waiting page, and no account', async () => {
	const before = users();
	const result = await register('10.0.0.9', { leave_empty: 'https://spam.example' });
	assert.equal(result.pending, true);
	assert.equal(users(), before, 'no account created');
});

test('one address creates three accounts an hour; other addresses are not affected', async () => {
	for (let i = 0; i < guard.REGISTRATIONS_PER_ADDRESS; i++) assert.equal((await register('10.0.0.1')).pending, true);
	const refused = await register('10.0.0.1');
	assert.equal(refused.status, 429);
	assert.match(refused.data.error, /Too many new accounts from this address/);
	assert.equal((await register('10.0.0.2')).pending, true);
});

test('refused sign-ups (a taken name) do not use up the address\'s allowance', async () => {
	assert.equal((await register('10.0.0.3', { username: 'boss' })).status, 409);
	assert.equal((await register('10.0.0.3', { username: 'boss' })).status, 409);
	for (let i = 0; i < guard.REGISTRATIONS_PER_ADDRESS; i++) assert.equal((await register('10.0.0.3')).pending, true);
});

test('a repeated password that differs is refused, before anything is created', async () => {
	const before = users();
	const result = await register('10.0.0.7', { confirm: 'password124' });
	assert.equal(result.status, 400);
	assert.match(result.data.error, /do not match/);
	assert.equal(users(), before);
});

test('the user center changes the password only when it is repeated correctly', async () => {
	const settings = await import('../src/routes/settings/+page.server.ts');
	const owner = auth.getUserByUsername('boss')!;
	const change = async (fields: Record<string, string>) => {
		const body = new FormData();
		for (const [key, value] of Object.entries(fields)) body.set(key, value);
		try {
			return await (settings.actions.password as any)({ request: new Request('http://localhost/settings', { method: 'POST', body }), locals: { user: auth.getUserById(owner.id), locale: 'en' } });
		} catch (thrown: any) {
			return { location: thrown?.location };
		}
	};
	const refused = await change({ current: 'password123', next: 'new-secret-1', confirm: 'new-secret-2' });
	assert.equal(refused.status, 400);
	assert.match(refused.data.error, /do not match/);
	assert.ok(await auth.verifyPassword('password123', auth.getUserById(owner.id)!.password_hash), 'unchanged');

	assert.equal((await change({ current: 'password123', next: 'new-secret-1', confirm: 'new-secret-1' })).location, '/login?next=/settings');
	assert.ok(await auth.verifyPassword('new-secret-1', auth.getUserById(owner.id)!.password_hash));
});

test('the allowance comes back an hour later', () => {
	const start = 1_000_000;
	for (let i = 0; i < guard.REGISTRATIONS_PER_ADDRESS; i++) guard.recordRegistration('10.9.9.9', start + i);
	assert.ok(guard.registrationRetryAfter('10.9.9.9', start + 10) > 59 * 60 * 1000);
	assert.equal(guard.registrationRetryAfter('10.9.9.9', start + 60 * 60 * 1000 + 1), 0);
});

test('with 50 accounts waiting, registration pauses until an admin catches up', async () => {
	const waiting = count('SELECT COUNT(*) FROM users WHERE approved = 0');
	for (let i = waiting; i < 50; i++) auth.createUser({ username: `queued${i}`, email: `q${i}@example.com`, passwordHash: 'x', pending: true });
	const paused = await register('10.0.0.4');
	assert.equal(paused.status, 503);
	assert.match(paused.data.error, /Registration is paused/);

	run("UPDATE users SET approved = 1, is_active = 1 WHERE username = 'queued10'");
	assert.equal((await register('10.0.0.4')).pending, true, 'one approval makes room for one');
});

test('passwords hashed without blocking the server still verify', async () => {
	const hash = await auth.hashPasswordAsync('correct horse');
	assert.equal(await auth.verifyPassword('correct horse', hash), true);
	assert.equal(await auth.verifyPassword('wrong', hash), false);
});

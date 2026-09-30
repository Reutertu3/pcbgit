/** Two-factor sign-in: TOTP codes, recovery codes, and the step between password and session. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';

import { fromBase32, hotp, matchStep, newRecoveryCodes, otpauthUri, toBase32 } from '../src/lib/server/totp.ts';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pcbgit-2fa-'));
process.env.PCBGIT_DATA_DIR = dataDir;
after(() => fs.rmSync(dataDir, { recursive: true, force: true }));

const { get } = await import('../src/lib/server/db/index.ts');
const auth = await import('../src/lib/server/auth.ts');
const twofactor = await import('../src/lib/server/twofactor.ts');
const login = await import('../src/routes/login/+page.server.ts');
const second = await import('../src/routes/login/2fa/+page.server.ts');
const users = await import('../src/routes/admin-panel/users/+page.server.ts');

/** The code an authenticator app would show for `secret` at `time`. */
const codeAt = (secret: string, time = Date.now()) => hotp(fromBase32(secret), Math.floor(time / 30_000));

test('codes match the RFC 6238 test vectors (SHA-1, last six digits)', () => {
	const key = Buffer.from('12345678901234567890');
	assert.equal(hotp(key, Math.floor(59 / 30)), '287082');
	assert.equal(hotp(key, Math.floor(1111111109 / 30)), '081804');
	assert.equal(hotp(key, Math.floor(1234567890 / 30)), '005924');
	assert.deepEqual(fromBase32(toBase32(key)), key);
	assert.equal(toBase32(key), 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
});

test('a code is accepted one step either way, and only once', () => {
	const secret = toBase32(Buffer.from('12345678901234567890'));
	const now = 1_000_000_000_000;
	const step = Math.floor(now / 30_000);
	assert.equal(matchStep(secret, codeAt(secret, now), null, now), step);
	assert.equal(matchStep(secret, codeAt(secret, now - 30_000), null, now), step - 1);
	assert.equal(matchStep(secret, codeAt(secret, now + 30_000), null, now), step + 1);
	assert.equal(matchStep(secret, codeAt(secret, now - 60_000), null, now), null);
	assert.equal(matchStep(secret, codeAt(secret, now), step, now), null, 'already used');
	assert.equal(matchStep(secret, 'abcdef', null, now), null);
});

test('recovery codes and the setup link have the expected shape', () => {
	const codes = newRecoveryCodes();
	assert.equal(new Set(codes).size, 10);
	for (const code of codes) assert.match(code, /^[a-z2-9]{5}-[a-z2-9]{5}$/);
	assert.equal(
		otpauthUri('My Hub', 'ada', 'ABC'),
		'otpauth://totp/My%20Hub%3Aada?secret=ABC&issuer=My+Hub&algorithm=SHA1&digits=6&period=30'
	);
});

/** A stand-in for SvelteKit's cookie jar. */
function jar(initial: Record<string, string> = {}) {
	const values = new Map(Object.entries(initial));
	return {
		values,
		get: (name: string) => values.get(name),
		set: (name: string, value: string) => void values.set(name, value),
		delete: (name: string) => void values.delete(name)
	};
}

/** Runs a form action; a thrown redirect comes back as `{ location }`. */
async function post(action: any, fields: Record<string, string>, cookies = jar(), locals: object = {}) {
	const body = new FormData();
	for (const [key, value] of Object.entries(fields)) body.set(key, value);
	const request = new Request('http://localhost/login', { method: 'POST', body });
	try {
		return await action({
			request,
			cookies,
			url: new URL('http://localhost/login'),
			locals: { locale: 'en', user: null, ...locals },
			getClientAddress: () => '192.0.2.1'
		});
	} catch (thrown: any) {
		if (thrown?.location) return { location: thrown.location };
		throw thrown;
	}
}

const ada = auth.createUser({ username: 'ada', email: 'ada@example.com', password: 'correct horse' });
let secret = '';
let recovery: string[] = [];

test('turning it on needs a code from the new secret', () => {
	secret = twofactor.pendingSecret(ada.id);
	assert.equal(twofactor.pendingSecret(ada.id), secret, 'kept while setting up');
	assert.equal(twofactor.enableTwoFactor(auth.getUserById(ada.id)!, '000000'), null);
	recovery = twofactor.enableTwoFactor(auth.getUserById(ada.id)!, codeAt(secret))!;
	assert.equal(recovery.length, 10);
	assert.equal(auth.getUserById(ada.id)!.totp_secret, secret);
	assert.equal(twofactor.recoveryCodesLeft(ada.id), 10);
});

test('the password alone makes no session, only a pending sign-in', async () => {
	const cookies = jar();
	const result = await post(login.actions.default, { login: 'ada', password: 'correct horse', next: '/settings' }, cookies);
	assert.equal(result.location, '/login/2fa');
	assert.ok(cookies.get(twofactor.CHALLENGE_COOKIE));
	assert.equal(cookies.get('pcbgit_session'), undefined);
});

test('the code step makes the session and goes where the sign-in was headed', async () => {
	const cookies = jar();
	await post(login.actions.default, { login: 'ada', password: 'correct horse', next: '/settings' }, cookies);
	// The code that turned it on is spent; the app's next one is accepted early.
	const next = codeAt(secret, Date.now() + 30_000);
	const wrong = await post(second.actions.default, { code: '000000' }, cookies);
	assert.equal(wrong.status, 401);
	const result = await post(second.actions.default, { code: next.slice(0, 3) + ' ' + next.slice(3) }, cookies);
	assert.equal(result.location, '/settings');
	assert.ok(cookies.get('pcbgit_session'));
	assert.equal(cookies.get(twofactor.CHALLENGE_COOKIE), undefined);

	// The same code again, on a new sign-in: refused.
	const again = jar();
	await post(login.actions.default, { login: 'ada', password: 'correct horse' }, again);
	assert.equal((await post(second.actions.default, { code: next }, again)).status, 401);
});

test('a recovery code works once', async () => {
	for (const expected of ['/', 401]) {
		const cookies = jar();
		await post(login.actions.default, { login: 'ada', password: 'correct horse' }, cookies);
		const result = await post(second.actions.default, { code: recovery[0].toUpperCase() }, cookies);
		assert.equal(result.location ?? result.status, expected);
	}
	assert.equal(twofactor.recoveryCodesLeft(ada.id), 9);
});

test('five wrong codes end the pending sign-in', async () => {
	const cookies = jar();
	await post(login.actions.default, { login: 'ada', password: 'correct horse' }, cookies);
	let result: any;
	for (let i = 0; i < 5; i++) result = await post(second.actions.default, { code: '000000' }, cookies);
	assert.equal(result.data.expired, true);
	assert.equal(cookies.get(twofactor.CHALLENGE_COOKIE), undefined);
});

test('admins can turn it off for a user who lost the authenticator, but not for an admin', async () => {
	const admin = auth.createUser({ username: 'root', email: 'root@example.com', password: 'x'.repeat(8), role: 'admin' });
	const act = (id: string) => post(users.actions.disableTwoFactor, { id }, jar(), { user: admin });

	const { run } = await import('../src/lib/server/db/index.ts');
	run("UPDATE users SET role = 'admin' WHERE id = ?", ada.id);
	assert.equal((await act(ada.id)).status, 403);
	assert.ok(auth.getUserById(ada.id)!.totp_secret);
	run("UPDATE users SET role = 'user' WHERE id = ?", ada.id);

	await act(ada.id);
	assert.equal(auth.getUserById(ada.id)!.totp_secret, null);
	assert.equal(twofactor.recoveryCodesLeft(ada.id), 0);
	assert.equal(get<{ action: string }>("SELECT action FROM audit_log WHERE action = 'admin.user_2fa_disable'")?.action, 'admin.user_2fa_disable');
});

test('only the owner demotes admins or resets their password or 2FA', async () => {
	const { run } = await import('../src/lib/server/db/index.ts');
	const owner = auth.createUser({ username: 'boss', email: 'boss@example.com', password: 'x'.repeat(8), role: 'admin' });
	// One owner, as ensureOwner() keeps it (bootstrap made the default admin one).
	run('UPDATE users SET is_owner = (id = ?)', owner.id);
	const admin = auth.getUserByUsername('root')!;
	const other = auth.createUser({ username: 'mod', email: 'mod@example.com', password: 'x'.repeat(8), role: 'admin' });
	const as = (actor: typeof admin, action: string, fields: Record<string, string>) =>
		post((users.actions as any)[action], fields, jar(), { user: auth.getUserById(actor.id) });

	for (const [action, fields] of [
		['disableTwoFactor', { id: other.id }],
		['resetPassword', { id: other.id, password: 'y'.repeat(8) }],
		['setRole', { id: other.id, role: 'user' }],
		// Their own too: the panel skips the password that settings ask for.
		['resetPassword', { id: admin.id, password: 'y'.repeat(8) }]
	] as const) {
		assert.equal((await as(admin, action, fields)).status, 403, action);
	}
	assert.equal(auth.getUserById(other.id)!.role, 'admin');
	assert.equal((await as(owner, 'resetPassword', { id: other.id, password: 'y'.repeat(8) })).success, true);
	assert.equal((await as(owner, 'setRole', { id: other.id, role: 'user' })).success, true);
});

test('the command-line reset lets a locked-out owner back in', async () => {
	const { execFileSync } = await import('node:child_process');
	const { count } = await import('../src/lib/server/db/index.ts');
	const owner = auth.getUserByUsername('boss')!;
	twofactor.pendingSecret(owner.id);
	twofactor.enableTwoFactor(auth.getUserById(owner.id)!, codeAt(twofactor.pendingSecret(owner.id)));
	auth.createSession(owner.id);

	const output = execFileSync(
		process.execPath,
		['--experimental-strip-types', '--no-warnings', '--import', './tests/resolve-hook.mjs', 'scripts/reset-owner.ts'],
		{ env: { ...process.env, PCBGIT_DATA_DIR: dataDir }, encoding: 'utf8' }
	);
	const password = /^Password: (\S+)$/m.exec(output)![1];
	const after = auth.getUserById(owner.id)!;
	assert.ok(await auth.verifyPassword(password, after.password_hash));
	assert.equal(after.totp_secret, null);
	assert.equal(count('SELECT COUNT(*) FROM sessions WHERE user_id = ?', owner.id), 0);
	assert.equal(count("SELECT COUNT(*) FROM audit_log WHERE action = 'admin.owner_reset'"), 1);
});

test('whether admins need two-factor sign-in is the owner\'s switch, off by default', async () => {
	const instance = await import('../src/routes/admin-panel/settings/+page.server.ts');
	const { getSetting } = await import('../src/lib/server/db/index.ts');
	const owner = auth.getUserByUsername('boss')!;
	const admin = auth.getUserByUsername('root')!;
	const panel = (action: string, fields: Record<string, string>) =>
		post((users.actions as any)[action], fields, jar(), { user: auth.getUserById(owner.id) });
	const flip = (actor: typeof owner, fields: Record<string, string>) =>
		post(instance.actions.saveAdminPolicy, fields, jar(), { user: auth.getUserById(actor.id) });

	// Off: an admin is made with a password alone, as before.
	assert.equal(twofactor.adminsNeedTwoFactor(), false);
	await panel('create', { username: 'trusted', email: 'trusted@example.com', password: 'x'.repeat(8), role: 'admin' });
	const trusted = auth.getUserByUsername('trusted')!;
	assert.equal(trusted.role, 'admin');
	assert.equal(trusted.totp_secret, null);

	assert.equal((await flip(admin, { admins_require_2fa: 'on' })).status, 403, 'not another admin\'s to set');
	assert.equal(getSetting('admins_require_2fa', 'false'), 'false');
	assert.equal((await flip(owner, { admins_require_2fa: 'on' })).saved, true);
	assert.equal(twofactor.adminsNeedTwoFactor(), true);
	// Admins from before keep their role.
	assert.equal(auth.getUserById(trusted.id)!.role, 'admin');
});

test('with the switch on, an account becomes admin only with two-factor sign-in on', async () => {
	const owner = auth.getUserByUsername('boss')!;
	const as = (action: string, fields: Record<string, string>) =>
		post((users.actions as any)[action], fields, jar(), { user: auth.getUserById(owner.id) });

	// A new account cannot have it yet, so the panel only creates users, whatever is posted.
	await as('create', { username: 'newhire', email: 'new@example.com', password: 'x'.repeat(8), role: 'admin' });
	const hire = auth.getUserByUsername('newhire')!;
	assert.equal(hire.role, 'user');

	const refused = await as('setRole', { id: hire.id, role: 'admin' });
	assert.equal(refused.status, 400);
	assert.match(refused.data.error, /newhire has to turn on two-factor sign-in/);
	assert.equal(auth.getUserById(hire.id)!.role, 'user');

	const secret = twofactor.pendingSecret(hire.id);
	assert.ok(twofactor.enableTwoFactor(auth.getUserById(hire.id)!, codeAt(secret)));
	assert.equal((await as('setRole', { id: hire.id, role: 'admin' })).success, true);
	assert.equal(auth.getUserById(hire.id)!.role, 'admin');
});

test('with the switch on, an admin cannot turn two-factor sign-in off, only replace the authenticator', async () => {
	const settings = await import('../src/routes/settings/2fa/+page.server.ts');
	const owner = auth.getUserByUsername('boss')!;
	const hire = () => auth.getUserByUsername('newhire')!;
	const own = (action: string, fields: Record<string, string>) =>
		post((settings.actions as any)[action], fields, jar(), { user: hire(), sessionId: 'current' });
	const panel = (action: string, fields: Record<string, string>) =>
		post((users.actions as any)[action], fields, jar(), { user: auth.getUserById(owner.id) });
	const password = 'x'.repeat(8);

	// Neither the admin nor the owner, from the panel.
	assert.equal((await own('disable', { password })).status, 403);
	assert.equal((await panel('disableTwoFactor', { id: hire().id })).status, 403);
	assert.ok(hire().totp_secret);

	// A new phone: the old secret works until a code from the new one confirms it.
	const old = hire().totp_secret!;
	assert.equal((await own('replace', { password: 'wrong' })).status, 401);
	await own('replace', { password });
	assert.equal(hire().totp_secret, old, 'still the old one while setting up');
	const next = hire().totp_pending!;
	assert.notEqual(next, old);
	assert.equal((await own('enable', { code: codeAt(next) })).codes.length, 10);
	assert.equal(hire().totp_secret, next);
	assert.equal(hire().totp_pending, null);

	// A user again: now it can be turned off.
	await panel('setRole', { id: hire().id, role: 'user' });
	assert.equal((await own('disable', { password })).status, undefined);
	assert.equal(hire().totp_secret, null);

	// And with the switch off again, an admin may turn it off as anyone may.
	const instance = await import('../src/routes/admin-panel/settings/+page.server.ts');
	await post(instance.actions.saveAdminPolicy, {}, jar(), { user: auth.getUserById(owner.id) });
	await panel('setRole', { id: hire().id, role: 'admin' });
	assert.equal(hire().role, 'admin', 'promoted without 2FA');
	const secret = twofactor.pendingSecret(hire().id);
	assert.ok(twofactor.enableTwoFactor(hire(), codeAt(secret)));
	assert.equal((await own('disable', { password })).status, undefined);
	assert.equal(hire().totp_secret, null);
});

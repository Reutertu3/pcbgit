/** Usernames: a profile lives at /<username>, so no account may take a top-level route's name. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pcbgit-usernames-'));
process.env.PCBGIT_DATA_DIR = dataDir;
after(() => fs.rmSync(dataDir, { recursive: true, force: true }));

const { RESERVED_USERNAMES, validateUsername } = await import('../src/lib/server/auth.ts');

test('every top-level route is a reserved username', () => {
	const routes = fs
		.readdirSync(path.resolve(import.meta.dirname, '../src/routes'), { withFileTypes: true })
		// [owner] is the profile itself; (groups) add no path segment.
		.filter((entry) => entry.isDirectory() && !/^[[(]/.test(entry.name))
		.map((entry) => entry.name);
	assert.ok(routes.length > 10, 'the routes folder was read');
	const missing = routes.filter((name) => !RESERVED_USERNAMES.has(name));
	assert.deepEqual(missing, [], 'add these to RESERVED_USERNAMES in auth.ts');
});

test('reserved names are refused whatever their case', () => {
	assert.equal(validateUsername('Messages'), 'validation.usernameReserved');
	assert.equal(validateUsername('stars'), 'validation.usernameReserved');
	assert.equal(validateUsername('ada-lovelace'), null);
});

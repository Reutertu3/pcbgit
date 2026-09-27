/** The git endpoint must not tell anyone without credentials which private boards exist. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pcbgit-gitaccess-'));
process.env.PCBGIT_DATA_DIR = dataDir;
after(() => fs.rmSync(dataDir, { recursive: true, force: true }));

const auth = await import('../src/lib/server/auth.ts');
const projects = await import('../src/lib/server/projects.ts');
const { GET } = await import('../src/routes/git/[owner]/[project]/[...path]/+server.ts');

const ada = auth.createUser({ username: 'ada', email: 'a@example.com', password: 'password123' });
const bob = auth.createUser({ username: 'bob', email: 'b@example.com', password: 'password123' });
await projects.createProject({ owner: ada, slug: 'secret', name: 'Secret', visibility: 'private' });
await projects.createProject({ owner: ada, slug: 'open', name: 'Open' });
const bobToken = auth.createAccessToken(bob.id, 'laptop');

/** What git sends first: the ref advertisement for a fetch or a push. */
async function refs(board: string, service: 'upload' | 'receive', token?: string) {
	const url = new URL(`http://localhost/git/ada/${board}.git/info/refs?service=git-${service}-pack`);
	const headers = new Headers(token ? { authorization: `Basic ${Buffer.from(`bob:${token}`).toString('base64')}` } : {});
	const response = await (GET as any)({
		params: { owner: 'ada', project: `${board}.git`, path: 'info/refs' },
		request: new Request(url, { headers }),
		url,
		locals: { user: null, locale: 'en' }
	});
	return { status: response.status as number, body: await response.text() };
}

test('without credentials, a private board and a missing one look the same', async () => {
	for (const service of ['upload', 'receive'] as const) {
		const hidden = await refs('secret', service);
		const missing = await refs('no-such-board', service);
		assert.equal(hidden.status, 401, `${service}: git needs a 401 to ask for a token`);
		assert.deepEqual(missing, hidden, `${service}: same status and text`);
	}
});

test('with a valid token, a missing board is a plain 404, and a hidden one too', async () => {
	assert.equal((await refs('no-such-board', 'upload', bobToken)).status, 404);
	assert.equal((await refs('secret', 'upload', bobToken)).status, 404, "bob cannot see ada's private board");
});

test('a public board still says why a push needs a token', async () => {
	const push = await refs('open', 'receive');
	assert.equal(push.status, 401);
	assert.match(push.body, /access token as the password/);
});

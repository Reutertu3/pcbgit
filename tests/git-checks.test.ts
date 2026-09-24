/** What reaches the render checkout from a pushed repository. */
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import test from 'node:test';

import { exportTree } from '../src/lib/server/git.ts';
import { PUSH_CHECKS, runGitBackend } from '../src/lib/server/githttp.ts';

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'pcbgit-gitchecks-'));
test.after(() => fs.rmSync(base, { recursive: true, force: true }));

const identity = { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
function git(cwd: string, args: string[], options: { input?: Buffer | string; env?: Record<string, string> } = {}) {
	return execFileSync('git', args, { cwd, input: options.input, env: { ...process.env, ...identity, ...options.env }, stdio: ['pipe', 'pipe', 'pipe'] })
		.toString()
		.trim();
}

/** A repository whose only commit holds a tree entry named "..", which git itself never writes. */
function maliciousRepo() {
	const dir = fs.mkdtempSync(path.join(base, 'evil-'));
	git(dir, ['init', '-q', '-b', 'main']);
	const blob = git(dir, ['hash-object', '-w', '--stdin'], { input: 'escape' });
	const entry = Buffer.concat([Buffer.from('100644 ..\0'), Buffer.from(blob, 'hex')]);
	const tree = git(dir, ['hash-object', '-t', 'tree', '--literally', '-w', '--stdin'], { input: entry });
	const commit = git(dir, ['commit-tree', tree, '-m', 'evil']);
	git(dir, ['update-ref', 'refs/heads/main', commit]);
	return dir;
}

function bareRepo() {
	const dir = path.join(fs.mkdtempSync(path.join(base, 'bare-')), 'target.git');
	git(base, ['init', '-q', '--bare', dir]);
	return dir;
}

/** Async: the HTTP server answering the push runs in this same process. */
function pushTo(source: string, remote: string) {
	return new Promise<string>((resolve) => {
		execFile('git', ['push', '-q', remote, 'main'], { cwd: source, env: { ...process.env, ...identity }, timeout: 30_000 }, (error, _stdout, stderr) =>
			resolve(error ? String(stderr || error.message) : 'accepted')
		);
	});
}

/** Serves one bare repository over smart HTTP through the app's own runGitBackend. */
async function serve(repoDir: string) {
	const server = http.createServer(async (req, res) => {
		const url = new URL(req.url ?? '/', 'http://localhost');
		const headers = new Headers();
		for (const [name, value] of Object.entries(req.headers)) if (typeof value === 'string') headers.set(name, value);
		const response = await runGitBackend({
			repoDir,
			pathInfo: url.pathname.replace(/^\/target\.git/, ''),
			method: req.method ?? 'GET',
			queryString: url.search.replace(/^\?/, ''),
			headers,
			body: req.method === 'POST' ? (Readable.toWeb(req) as ReadableStream<Uint8Array>) : null,
			remoteUser: 'tester'
		});
		res.writeHead(response.status, Object.fromEntries(response.headers));
		if (response.body) Readable.fromWeb(response.body as never).pipe(res);
		else res.end();
	});
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/target.git`, close: () => server.close() };
}

test('pushes are checked: a tree entry named ".." is rejected', async () => {
	const evil = maliciousRepo();
	// Git stores it when nothing checks, so the test object really is malformed but storable.
	assert.equal(await pushTo(evil, bareRepo()), 'accepted');

	const target = bareRepo();
	const server = await serve(target);
	try {
		assert.match(await pushTo(evil, server.url), /hasDotdot|fsck|rejected/i);
		// And nothing of it was stored.
		assert.throws(() => git(target, ['rev-parse', '--verify', 'refs/heads/main']));
	} finally {
		server.close();
	}
	assert.equal(PUSH_CHECKS.GIT_CONFIG_KEY_0, 'receive.fsckObjects');
});

test('pushes of ordinary history still go through', async () => {
	const good = fs.mkdtempSync(path.join(base, 'good-'));
	git(good, ['init', '-q', '-b', 'main']);
	fs.writeFileSync(path.join(good, 'board.kicad_pcb'), '(kicad_pcb)');
	git(good, ['add', '-A']);
	git(good, ['commit', '-q', '-m', 'board']);
	const target = bareRepo();
	const server = await serve(target);
	try {
		assert.equal(await pushTo(good, server.url), 'accepted');
		assert.equal(git(target, ['rev-parse', 'refs/heads/main']), git(good, ['rev-parse', 'HEAD']));
	} finally {
		server.close();
	}
});

test('the render checkout drops symlinks that leave it, and keeps the others', async () => {
	const work = fs.mkdtempSync(path.join(base, 'links-'));
	git(work, ['init', '-q', '-b', 'main']);
	fs.mkdirSync(path.join(work, 'lib'));
	fs.writeFileSync(path.join(work, 'lib', 'parts.kicad_sym'), '(kicad_symbol_lib)');
	fs.writeFileSync(path.join(work, 'board.kicad_pcb'), '(kicad_pcb)');
	fs.symlinkSync('lib/parts.kicad_sym', path.join(work, 'inside.kicad_sym'));
	fs.symlinkSync('/etc/passwd', path.join(work, 'absolute.kicad_sch'));
	fs.symlinkSync('../../../../data/pcbgit.db', path.join(work, 'lib', 'escaping.kicad_sch'));
	git(work, ['add', '-A']);
	git(work, ['commit', '-q', '-m', 'links']);

	const out = fs.mkdtempSync(path.join(base, 'out-'));
	const checkout = await exportTree(path.join(work, '.git'), 'HEAD', out, 'checkout');
	assert.ok(fs.existsSync(path.join(checkout, 'board.kicad_pcb')));
	assert.equal(fs.readlinkSync(path.join(checkout, 'inside.kicad_sym')), 'lib/parts.kicad_sym');
	assert.ok(!fs.existsSync(path.join(checkout, 'absolute.kicad_sch')) && !isLink(path.join(checkout, 'absolute.kicad_sch')));
	assert.ok(!isLink(path.join(checkout, 'lib', 'escaping.kicad_sch')));
});

test('a chain of links that each look local, and a link to /, are dropped too', async () => {
	const work = fs.mkdtempSync(path.join(base, 'chain-'));
	git(work, ['init', '-q', '-b', 'main']);
	fs.mkdirSync(path.join(work, 'x'));
	fs.writeFileSync(path.join(work, 'board.kicad_pcb'), '(kicad_pcb)');
	// x/d is the checkout itself; through it, "d/../outside.txt" reads like x/outside.txt
	// but the kernel goes one level above the checkout.
	fs.symlinkSync('..', path.join(work, 'x', 'd'));
	fs.symlinkSync('d/../outside.txt', path.join(work, 'x', 'leak.kicad_sch'));
	fs.symlinkSync('/', path.join(work, 'everything'));
	git(work, ['add', '-A']);
	git(work, ['commit', '-q', '-m', 'chain']);

	const out = fs.mkdtempSync(path.join(base, 'out-'));
	fs.writeFileSync(path.join(out, 'outside.txt'), 'not part of the board');
	const started = Date.now();
	const checkout = await exportTree(path.join(work, '.git'), 'HEAD', out, 'checkout');
	assert.ok(Date.now() - started < 5000, 'the link to / is not walked');
	assert.ok(isLink(path.join(checkout, 'x', 'd')), 'a link back to the checkout stays inside it');
	assert.ok(!isLink(path.join(checkout, 'x', 'leak.kicad_sch')));
	assert.ok(!isLink(path.join(checkout, 'everything')));
});

function isLink(file: string) {
	try {
		return fs.lstatSync(file).isSymbolicLink();
	} catch {
		return false;
	}
}

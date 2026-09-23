/** scripts/render-runner.ts, driven through the app's own runTool, with a stand-in kicad-cli. */
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { runKicad, type RunnerResponse } from '../src/lib/server/render/kicad.ts';

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'pcbgit-runner-'));
const work = path.join(base, 'work');
const socketPath = path.join(work, 'runner.sock');
const fakeKicad = path.join(base, 'kicad-cli');
fs.mkdirSync(work);
// Prints its arguments, working directory and two variables; exits with N from "exit:N".
fs.writeFileSync(
	fakeKicad,
	'#!/bin/sh\necho "args=$* cwd=$(pwd) ld=${LD_PRELOAD:-} ibom=${INTERACTIVE_HTML_BOM_NO_DISPLAY:-}"\ncase "$1" in exit:*) exit "${1#exit:}";; esac\n',
	{ mode: 0o755 }
);

let runner: ChildProcess;

test.before(async () => {
	runner = spawn(process.execPath, ['scripts/render-runner.ts'], {
		env: { ...process.env, PCBGIT_RENDER_SOCKET: socketPath, PCBGIT_RENDER_DIR: work, PCBGIT_KICAD_CLI: fakeKicad, PCBGIT_IBOM: '/opt/ibom/generate_interactive_bom.py' },
		stdio: ['ignore', 'pipe', 'inherit']
	});
	await new Promise<void>((resolve) => runner.stdout!.on('data', (chunk) => String(chunk).includes('listening') && resolve()));
	process.env.PCBGIT_RENDER_SOCKET = socketPath;
});

test.after(() => {
	delete process.env.PCBGIT_RENDER_SOCKET;
	runner.kill('SIGTERM');
	fs.rmSync(base, { recursive: true, force: true });
});

/** A request the app would never send, straight onto the socket. */
function raw(request: unknown) {
	return new Promise<RunnerResponse>((resolve, reject) => {
		let buffered = '';
		const connection = net.createConnection(socketPath, () => connection.write(`${JSON.stringify(request)}\n`));
		connection.setEncoding('utf8');
		connection.on('data', (chunk: string) => (buffered += chunk));
		connection.on('end', () => resolve(JSON.parse(buffered)));
		connection.on('error', reject);
	});
}

test('the runner runs kicad-cli in the render directory and reports its exit code', async () => {
	const board = path.join(work, 'checkout-1', 'board.kicad_pcb');
	const ok = await runKicad(['exit:0', board], 5000);
	assert.equal(ok.ok, true, ok.stderr);
	assert.match(ok.stdout, new RegExp(`args=exit:0 ${board} cwd=${work}`));
	assert.equal((await runKicad(['exit:5'], 5000)).ok, true);
	const failed = await runKicad(['exit:3'], 5000);
	assert.equal(failed.ok, false);
	assert.equal(failed.code, 3);
});

test('the runner refuses paths outside the render directory', async () => {
	for (const bad of ['/data/pcbgit.db', '../outside/x.kicad_pcb', `${work}/../escape`]) {
		const result = await runKicad(['sch', 'export', 'svg', '--output', bad], 5000);
		assert.equal(result.ok, false, bad);
		assert.match(result.stderr, /renderer refused: path outside the render directory/, bad);
	}
});

test('the runner only runs the render tools, with its own environment', async () => {
	// The thumbnail rasterisers are allowed, but their paths are checked too.
	assert.match((await raw({ bin: 'rsvg-convert', args: ['-o', `${work}/t.png`, '/data/artifacts/x/sheet-0.svg'], timeoutMs: 1000, env: {} })).stderr, /path outside the render directory/);
	assert.doesNotMatch((await raw({ bin: 'cwebp', args: ['-quiet', `${work}/t.png`, '-o', `${work}/t.webp`], timeoutMs: 1000, env: {} })).stderr, /renderer refused/);
	assert.match((await raw({ bin: 'sh', args: ['-c', 'id'], timeoutMs: 1000, env: {} })).stderr, /not allowed: sh/);
	assert.match((await raw({ bin: 'python3', args: ['-c', 'print(1)'], timeoutMs: 1000, env: {} })).stderr, /not allowed: python3/);
	assert.match((await raw({ nonsense: true })).stderr, /malformed request/);

	// Only allowed variables pass: LD_PRELOAD is dropped, iBOM's flag kept.
	const env = await raw({ bin: 'kicad-cli', args: ['exit:0'], timeoutMs: 1000, env: { LD_PRELOAD: '/x.so', INTERACTIVE_HTML_BOM_NO_DISPLAY: '1' } });
	assert.match(env.stdout, /ld= ibom=1/);

	// iBOM is allowed by its script path; the board path is still checked.
	const ibom = await raw({ bin: 'python3', args: ['/opt/ibom/generate_interactive_bom.py', '--dest-dir', work, '/elsewhere/board.kicad_pcb'], timeoutMs: 1000, env: {} });
	assert.match(ibom.stderr, /path outside the render directory: \/elsewhere\/board.kicad_pcb/);
});

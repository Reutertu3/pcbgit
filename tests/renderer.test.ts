/** The app's side of the renderer socket, against a stand-in renderer. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { kicadVersion, resetKicadVersionCache, runKicad, type RunnerRequest } from '../src/lib/server/render/kicad.ts';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pcbgit-renderer-'));
const socketPath = path.join(dir, 'runner.sock');

/** Answers each request with the code in its first argument ("exit:<n>"). */
function standIn(received: RunnerRequest[]) {
	const server = net.createServer((connection) => {
		let buffered = '';
		connection.setEncoding('utf8');
		connection.on('data', (chunk: string) => {
			buffered += chunk;
			if (!buffered.includes('\n')) return;
			const request = JSON.parse(buffered.slice(0, buffered.indexOf('\n'))) as RunnerRequest;
			received.push(request);
			const code = Number(/^exit:(\d+)$/.exec(request.args[0] ?? '')?.[1] ?? 0);
			connection.end(`${JSON.stringify({ code, stdout: 'KiCad 10.0.6\n', stderr: code ? 'boom' : '' })}\n`);
		});
	});
	return new Promise<net.Server>((resolve) => server.listen(socketPath, () => resolve(server)));
}

test('render tools go to the renderer when PCBGIT_RENDER_SOCKET is set', async (t) => {
	const received: RunnerRequest[] = [];
	const server = await standIn(received);
	process.env.PCBGIT_RENDER_SOCKET = socketPath;
	process.env.PCBGIT_TEST_SECRET = 'must-not-leak';
	t.after(() => {
		delete process.env.PCBGIT_RENDER_SOCKET;
		delete process.env.PCBGIT_TEST_SECRET;
		server.close();
		fs.rmSync(dir, { recursive: true, force: true });
	});

	const ok = await runKicad(['exit:0', '/work/board.kicad_pcb'], 1000);
	assert.equal(ok.ok, true);
	assert.equal(ok.stdout, 'KiCad 10.0.6\n');
	assert.deepEqual(received[0], { bin: 'kicad-cli', args: ['exit:0', '/work/board.kicad_pcb'], timeoutMs: 1000, env: {} });
	// Only tool-specific variables cross the socket, never the app's environment.
	assert.ok(!JSON.stringify(received).includes('must-not-leak'));

	// 5 is kicad-cli's "violations found": a successful DRC/ERC run.
	assert.equal((await runKicad(['exit:5'])).ok, true);
	const failed = await runKicad(['exit:1']);
	assert.equal(failed.ok, false);
	assert.equal(failed.code, 1);
	assert.equal(failed.stderr, 'boom');
});

test('an unreachable renderer is a failed run, and does not stick', async () => {
	process.env.PCBGIT_RENDER_SOCKET = path.join(os.tmpdir(), 'pcbgit-no-such-runner.sock');
	try {
		resetKicadVersionCache();
		const result = await runKicad(['--version']);
		assert.equal(result.ok, false);
		assert.match(result.stderr, /renderer unavailable/);
		// Not cached: once the renderer is up, the next render sees kicad-cli.
		assert.equal(await kicadVersion(), null);
	} finally {
		delete process.env.PCBGIT_RENDER_SOCKET;
		resetKicadVersionCache();
	}
});

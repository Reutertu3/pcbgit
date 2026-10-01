/** The STEP download: stored as board.step.tar.gz and sent as it is, never unpacked by the server. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import zlib from 'node:zlib';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pcbgit-step-'));
process.env.PCBGIT_DATA_DIR = dataDir;
after(() => fs.rmSync(dataDir, { recursive: true, force: true }));

const { run } = await import('../src/lib/server/db/index.ts');
const { storeArtifact } = await import('../src/lib/server/render/artifacts.ts');
const { pcbStepArgs } = await import('../src/lib/server/render/kicad.ts');
const { tarOneFile } = await import('../src/lib/server/render/tarball.ts');
const { GET } = await import('../src/routes/artifacts/[commit]/[...file]/+server.ts');

const STEP = 'ISO-10303-21;\nHEADER;\n' + 'DATA;\n'.repeat(2000) + 'END-ISO-10303-21;\n';

run("INSERT INTO users (id, username, email, password_hash, created_at, updated_at) VALUES ('u1','ada','a@example.com','x',0,0)");
run("INSERT INTO projects (id, owner_id, slug, name, created_at, updated_at) VALUES ('p1','u1','board','Board',0,0)");
run(`INSERT INTO commits (id, project_id, sha, branch, message, author_name, author_email, committed_at, created_at)
	 VALUES ('c1','p1','abc1234','main','first','Ada','a@example.com',0,0)`);
const stored = await storeArtifact({
	commitId: 'c1',
	kind: 'pcb_step',
	name: 'board.step',
	data: zlib.gzipSync(tarOneFile('board.step', Buffer.from(STEP))),
	targetName: 'board.step.tar.gz'
});
// Versions rendered up to v0.8.2 have the gzipped STEP alone.
const legacy = await storeArtifact({ commitId: 'c1', kind: 'pcb_step', name: 'board.step', data: zlib.gzipSync(STEP), targetName: 'board.step.gz' });

/** Requests the artifact the way a client with these request headers would. */
async function download(file: string, headers: Record<string, string> = {}) {
	const sent: Record<string, string> = {};
	const response: Response = await (GET as any)({
		params: { commit: 'c1', file },
		locals: { user: null },
		request: new Request(`http://localhost/artifacts/c1/${file}`, { headers }),
		url: new URL(`http://localhost/artifacts/c1/${file}?v=1`),
		// As SvelteKit's: a header can be set once.
		setHeaders: (values: Record<string, string>) => {
			for (const [name, value] of Object.entries(values)) {
				assert.ok(!(name in sent), `"${name}" header is already set`);
				sent[name] = value;
			}
		}
	});
	return { sent, body: Buffer.from(await response.arrayBuffer()) };
}

test('the export asks for the board with its models, copper and silkscreen', () => {
	const args = pcbStepArgs('/work/board.kicad_pcb', '/work/board.step');
	assert.deepEqual(args.slice(0, 3), ['pcb', 'export', 'step']);
	// --include-tracks covers vias as well.
	for (const flag of ['--subst-models', '--include-tracks', '--include-pads', '--include-zones', '--include-silkscreen']) {
		assert.ok(args.includes(flag), flag);
	}
});

test('the archive is a tar any tool reads, with board.step inside', () => {
	const archive = path.join(dataDir, 'check.tar');
	fs.writeFileSync(archive, zlib.gunzipSync(fs.readFileSync(stored)));
	assert.equal(execFileSync('tar', ['-tf', archive], { encoding: 'utf8' }), 'board.step\n');
	assert.equal(execFileSync('tar', ['-xOf', archive, 'board.step'], { encoding: 'utf8' }), STEP);
});

test('the tar.gz is sent as it is, whatever the client accepts', async () => {
	for (const headers of [{ 'accept-encoding': 'gzip, deflate, br' }, {}] as Record<string, string>[]) {
		const { sent, body } = await download('board.step.tar.gz', headers);
		assert.equal(sent['Content-Encoding'], undefined);
		assert.equal(sent['Content-Type'], 'application/gzip');
		assert.equal(sent['Content-Disposition'], 'attachment');
		assert.equal(sent['Content-Length'], String(fs.statSync(stored).size));
		assert.deepEqual(body, fs.readFileSync(stored));
	}
});

test('board.step.gz of older renders is sent packed too', async () => {
	const { sent, body } = await download('board.step.gz');
	assert.equal(sent['Content-Encoding'], undefined);
	assert.equal(sent['Content-Type'], 'application/gzip');
	assert.deepEqual(body, fs.readFileSync(legacy));
});

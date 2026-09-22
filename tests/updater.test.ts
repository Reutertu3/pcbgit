/** The app's half of the update handshake: it may only request, and read back status. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';

const control = fs.mkdtempSync(path.join(os.tmpdir(), 'pcbgit-control-'));
process.env.PCBGIT_CONTROL_DIR = control;
process.env.PCBGIT_VERSION = 'abc1234';
const updater = await import('../src/lib/server/updater.ts');

after(() => fs.rmSync(control, { recursive: true, force: true }));

test('reports the running version and an empty state before any update', () => {
	assert.equal(updater.runningVersion(), 'abc1234');
	assert.deepEqual(updater.updateState(), { status: null, log: '', requested: false });
});

test('a request is a file the host watcher picks up, carrying who asked and whether to force', () => {
	updater.requestUpdate('admin', true);
	const request = JSON.parse(fs.readFileSync(path.join(control, 'update-request'), 'utf8'));
	assert.equal(request.by, 'admin');
	assert.equal(request.force, true);
	// update.sh detects force with a grep; keep the format it expects.
	assert.match(fs.readFileSync(path.join(control, 'update-request'), 'utf8'), /"force": *true/);
	assert.equal(updater.updateState()?.requested, true);
});

test('status and log written by update.sh are read back', () => {
	fs.rmSync(path.join(control, 'update-request'));
	fs.writeFileSync(
		path.join(control, 'update-status.json'),
		'{"state":"success","message":"Updated a → b","started":1,"finished":2,"from":"a","to":"b"}\n'
	);
	fs.writeFileSync(path.join(control, 'update.log'), '== done\n');
	const state = updater.updateState()!;
	assert.equal(state.status?.state, 'success');
	assert.equal(state.status?.to, 'b');
	assert.equal(state.log, '== done\n');
	assert.equal(state.requested, false);
});

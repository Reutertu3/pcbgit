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

test('GitHub remotes in any form become web URLs; other hosts do not', () => {
	assert.equal(updater.githubWebUrl('git@github.com:me/pcbgit.git'), 'https://github.com/me/pcbgit');
	assert.equal(updater.githubWebUrl('https://github.com/me/pcbgit.git'), 'https://github.com/me/pcbgit');
	assert.equal(updater.githubWebUrl('https://github.com/me/pcbgit'), 'https://github.com/me/pcbgit');
	assert.equal(updater.githubWebUrl('https://onedev.example.com/pcbgit'), null);
});

test('availability and the changelog written by update.sh --check are read back', () => {
	assert.equal(updater.updateAvailability()?.checked, 0, 'never checked');

	fs.writeFileSync(
		path.join(control, 'update-available.json'),
		'{"checked":1700000000,"ok":true,"branch":"master","current":"aaa1111","latest":"bbb2222","behind":2,"ahead":0,"remote":"git@github.com:me/pcbgit.git"}\n'
	);
	// Same format as: git log --format='%H%x1f%h%x1f%an%x1f%ct%x1f%s'
	fs.writeFileSync(
		path.join(control, 'update-commits.txt'),
		['b'.repeat(40), 'bbb2222', 'Dev Person', '1700000000', 'Say "hi" \\ with emoji 🚀'].join('\u001f') + '\n' +
			['c'.repeat(40), 'ccc3333', 'Dev Person', '1699990000', 'First change'].join('\u001f') + '\n'
	);

	const available = updater.updateAvailability()!;
	assert.equal(available.behind, 2);
	assert.equal(available.checked, 1_700_000_000_000);
	assert.equal(available.commits.length, 2);
	assert.equal(available.commits[0].subject, 'Say "hi" \\ with emoji 🚀');
	assert.equal(available.commits[0].url, `https://github.com/me/pcbgit/commit/${'b'.repeat(40)}`);
	assert.equal(available.checkRequested, false);

	updater.requestCheck();
	assert.equal(updater.updateAvailability()?.checkRequested, true);
});

test('a failed check is reported as such', () => {
	fs.writeFileSync(path.join(control, 'update-available.json'), '{"checked":1700000000,"ok":false}\n');
	assert.equal(updater.updateAvailability()?.ok, false);
});

test('the image state and source from update.sh --check are read back; unknown states are dropped', () => {
	fs.writeFileSync(
		path.join(control, 'update-available.json'),
		'{"checked":1700000000,"ok":true,"branch":"master","current":"aaa1111","latest":"bbb2222","behind":1,"ahead":0,"remote":"x","source":"ghcr.io/me/pcbgit","image":"building"}\n'
	);
	assert.equal(updater.updateAvailability()?.source, 'ghcr.io/me/pcbgit');
	assert.equal(updater.updateAvailability()?.image, 'building');
	// A server that builds itself writes an empty source; an up-to-date one no image state.
	fs.writeFileSync(
		path.join(control, 'update-available.json'),
		'{"checked":1700000000,"ok":true,"branch":"master","current":"a","latest":"a","behind":0,"ahead":0,"remote":"x","source":"","image":"surprise"}\n'
	);
	assert.equal(updater.updateAvailability()?.source, null);
	assert.equal(updater.updateAvailability()?.image, null);
});

test('steps, how and trigger of an update are read back', () => {
	fs.writeFileSync(
		path.join(control, 'update-status.json'),
		'{"state":"running","step":"pull","how":"pulled","trigger":"auto","message":"Downloading","started":1,"finished":null,"from":"a","to":"b","target":"b"}\n'
	);
	const status = updater.updateState()!.status!;
	assert.equal(status.step, 'pull');
	assert.equal(status.how, 'pulled');
	assert.equal(status.trigger, 'auto');
	assert.equal(status.target, 'b');
});

test('automatic updates are a file the host script looks for', () => {
	assert.equal(updater.autoUpdateEnabled(), false);
	updater.setAutoUpdate(true, 'admin');
	assert.ok(fs.existsSync(path.join(control, 'auto-update')));
	assert.equal(updater.autoUpdateEnabled(), true);
	updater.setAutoUpdate(false, 'admin');
	assert.equal(updater.autoUpdateEnabled(), false);
	// Turning it off twice is fine.
	updater.setAutoUpdate(false, 'admin');
});

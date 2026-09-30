/** Scheduled snapshots: when they are due, what is kept, the copy folder, and a full disk. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pcbgit-schedule-'));
const copies = fs.mkdtempSync(path.join(os.tmpdir(), 'pcbgit-schedule-copies-'));
process.env.PCBGIT_DATA_DIR = dataDir;
after(() => {
	for (const dir of [dataDir, copies]) fs.rmSync(dir, { recursive: true, force: true });
});

const { setSetting } = await import('../src/lib/server/db/index.ts');
const { ensureDirs } = await import('../src/lib/server/paths.ts');
const { createSnapshot, listSnapshots } = await import('../src/lib/server/backups.ts');
const schedule = await import('../src/lib/server/backupschedule.ts');
ensureDirs();

/** Local time, as the schedule's hour is server time. */
const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute).getTime();
const HOUR = 60 * 60 * 1000;

test('a daily snapshot is due at the set hour after the last one, or after switching it on', () => {
	const daily = { schedule: 'daily' as const, hour: 3, since: at(1, 10) };
	assert.equal(schedule.nextRun(daily, { success: null, failure: null }), at(2, 3), 'first slot after switching on');
	assert.equal(schedule.nextRun(daily, { success: at(2, 3, 1), failure: at(2, 3, 1) }), at(3, 3));
	assert.equal(schedule.nextRun({ ...daily, schedule: 'off' }, { success: null, failure: null }), null);
});

test('a weekly one comes seven days on, and a failed run is retried an hour later', () => {
	const weekly = { schedule: 'weekly' as const, hour: 3, since: at(1, 10) };
	assert.equal(schedule.nextRun(weekly, { success: null, failure: null }), at(2, 3));
	assert.equal(schedule.nextRun(weekly, { success: at(2, 3, 1), failure: at(2, 3, 1) }), at(9, 3));
	const daily = { ...weekly, schedule: 'daily' as const };
	assert.equal(schedule.nextRun(daily, { success: at(2, 3), failure: at(3, 3) }), at(3, 4), 'retry an hour after the failure');
});

test('only the newest scheduled snapshots are kept, here and in the copy folder', async () => {
	process.env.PCBGIT_BACKUP_COPY_DIR = copies;
	setSetting('backup_keep', '2');
	const manual = await createSnapshot({ includeArtifacts: false, actorId: null });

	const made = [];
	for (let i = 0; i < 3; i++) made.push(await schedule.runScheduledSnapshot());
	assert.ok(made.every((name) => name?.includes('-scheduled')), made.join(', '));

	const names = listSnapshots().snapshots.map((snapshot) => snapshot.name);
	assert.equal(names.filter((name) => name.includes('-scheduled')).length, 2);
	assert.ok(names.includes(manual), 'a manual snapshot is never pruned');
	assert.ok(!names.includes(made[0]!), 'the oldest scheduled one went');

	const copied = fs.readdirSync(copies);
	assert.equal(copied.length, 2, copied.join(', '));
	assert.ok(copied.includes(made[2]!));
	assert.equal(schedule.scheduleStatus('en').error, null);
	assert.equal(schedule.copyDirState(), 'ok');
});

test('a copy folder that cannot be written is reported, and the snapshot still counts', async () => {
	process.env.PCBGIT_BACKUP_COPY_DIR = path.join(copies, 'not-mounted');
	const name = await schedule.runScheduledSnapshot();
	assert.ok(name);
	assert.equal(schedule.copyDirState(), 'unwritable');
	assert.match(schedule.scheduleStatus('en').error ?? '', /copying it to .*not-mounted failed/);
	assert.match(schedule.scheduleStatus('de').error ?? '', /Kopieren nach .*not-mounted/);
	delete process.env.PCBGIT_BACKUP_COPY_DIR;
});

test('without room above the free-disk minimum, nothing is written and the reason is kept', async () => {
	const before = listSnapshots().snapshots.length;
	process.env.PCBGIT_MIN_FREE_DISK = '1000000G';
	try {
		assert.equal(await schedule.runScheduledSnapshot(), null);
	} finally {
		delete process.env.PCBGIT_MIN_FREE_DISK;
	}
	assert.equal(listSnapshots().snapshots.length, before);
	const status = schedule.scheduleStatus('en');
	assert.match(status.error ?? '', /disk/i);
	// A failure after the last success is tried again an hour after the attempt.
	setSetting('backup_schedule', 'daily');
	assert.ok(status.lastRun && schedule.scheduleStatus('en').next! >= Date.now() + HOUR - 60_000);
});

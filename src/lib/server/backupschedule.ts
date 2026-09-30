/**
 * Snapshots on a timer, for servers with no other backup: daily or weekly at a
 * set hour (server time), keeping the newest few, and optionally a copy of each
 * in a second folder (PCBGIT_BACKUP_COPY_DIR, e.g. a NAS mount), which the
 * server's own disk failing would not take with it. Only snapshots the schedule
 * made are ever deleted; manual, uploaded and pre-update ones are left alone.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { UserError, translate, type Locale } from '../i18n';
import { audit, getSetting, setSetting } from './db';
import { createSnapshot, isLabelled, pruneLabel, snapshotPath, snapshotsLabelled } from './backups';

export const SCHEDULE_LABEL = 'scheduled';
export const SCHEDULES = ['off', 'daily', 'weekly'] as const;
export type Schedule = (typeof SCHEDULES)[number];

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
/** How often the timer looks; a snapshot starts at most this late. */
const CHECK_EVERY = 10 * 60 * 1000;
/** After a failed run (disk full, copy folder gone), the next try. */
const RETRY_AFTER = HOUR;

export interface ScheduleSettings {
	schedule: Schedule;
	/** Hour of the day, server time. */
	hour: number;
	keep: number;
	includeArtifacts: boolean;
	/** When the schedule was last switched on: the first run is the first slot after it. */
	since: number;
}

export function scheduleSettings(): ScheduleSettings {
	const schedule = getSetting('backup_schedule', 'off') as Schedule;
	return {
		schedule: SCHEDULES.includes(schedule) ? schedule : 'off',
		hour: clamp(Number(getSetting('backup_hour', '3')), 0, 23),
		keep: clamp(Number(getSetting('backup_keep', '7')), 1, 100),
		includeArtifacts: getSetting('backup_artifacts', 'false') === 'true',
		since: Number(getSetting('backup_since', '0')) || 0
	};
}

export function saveScheduleSettings(next: Omit<ScheduleSettings, 'since'>, actorId: string) {
	const before = scheduleSettings();
	setSetting('backup_schedule', next.schedule);
	setSetting('backup_hour', String(clamp(next.hour, 0, 23)));
	setSetting('backup_keep', String(clamp(next.keep, 1, 100)));
	setSetting('backup_artifacts', String(next.includeArtifacts));
	// Switched on (or to another rhythm): count from now, not from a run long ago.
	if (next.schedule !== 'off' && next.schedule !== before.schedule) setSetting('backup_since', String(Date.now()));
	audit(actorId, 'admin.backup_schedule', next.schedule, `hour ${next.hour}, keep ${next.keep}, ${next.includeArtifacts ? 'with' : 'without'} artifacts`);
}

function clamp(value: number, min: number, max: number) {
	return Number.isFinite(value) ? Math.min(max, Math.max(min, Math.floor(value))) : min;
}

/** The last result, for the admin page, in the viewer's language. */
export function scheduleStatus(locale: Locale) {
	const settings = scheduleSettings();
	const success = Number(getSetting('backup_last_run', '0')) || null;
	const failure = Number(getSetting('backup_last_attempt', '0')) || null;
	return {
		lastRun: success,
		lastName: getSetting('backup_last_name', '') || null,
		error: readError(getSetting('backup_last_error', ''), locale),
		next: nextRun(settings, { success, failure })
	};
}

/** Errors are stored as their translation key (or plain text), and read in whichever language. */
function storeError(error: { key: string; params?: Record<string, string | number> } | { text: string } | null) {
	setSetting('backup_last_error', error ? JSON.stringify(error) : '');
}

function readError(stored: string, locale: Locale) {
	if (!stored) return null;
	try {
		const error = JSON.parse(stored);
		return 'key' in error ? translate(locale, error.key, error.params) : String(error.text);
	} catch {
		return stored;
	}
}

/**
 * When the next snapshot is due: the first slot (the set hour, every day or every
 * seventh day) after the last success, or after the schedule was switched on.
 * A failed run is tried again an hour later. `failure` is the last attempt,
 * which equals `success` when it worked.
 */
export function nextRun(
	settings: Pick<ScheduleSettings, 'schedule' | 'hour' | 'since'>,
	last: { success: number | null; failure: number | null }
): number | null {
	if (settings.schedule === 'off') return null;
	const after = Math.max(last.success ?? 0, settings.since);
	const every = settings.schedule === 'weekly' ? 7 * DAY : DAY;
	// The first slot at the set hour after `after`, then `every` from the last success.
	let due = slotAfter(after, settings.hour);
	if (last.success && settings.schedule === 'weekly') due = Math.max(due, slotAfter(last.success + every - HOUR, settings.hour));
	if (last.failure && last.failure > (last.success ?? 0)) due = Math.max(due, last.failure + RETRY_AFTER);
	return due;
}

/** The first time at `hour`:00 (server time) later than `time`. */
function slotAfter(time: number, hour: number) {
	const slot = new Date(time);
	slot.setHours(hour, 0, 0, 0);
	if (slot.getTime() <= time) slot.setDate(slot.getDate() + 1);
	return slot.getTime();
}

/** Where copies go, or null when not set up. */
export function copyDir(value = process.env.PCBGIT_BACKUP_COPY_DIR) {
	return value?.trim() ? path.resolve(value.trim()) : null;
}

/** Whether the copy folder can be written to, for the admin page. */
export function copyDirState(dir = copyDir()): 'unset' | 'ok' | 'unwritable' {
	if (!dir) return 'unset';
	try {
		fs.accessSync(dir, fs.constants.W_OK);
		return fs.statSync(dir).isDirectory() ? 'ok' : 'unwritable';
	} catch {
		return 'unwritable';
	}
}

let running = false;

/**
 * One scheduled snapshot, then retention here and in the copy folder. A failed
 * copy is reported, but the snapshot itself counts as done.
 */
export async function runScheduledSnapshot(now = Date.now()) {
	if (running) return null;
	running = true;
	const settings = scheduleSettings();
	setSetting('backup_last_attempt', String(now));
	try {
		// The last one of its kind is the best guess of the next one's size.
		const expectedBytes = snapshotsLabelled(SCHEDULE_LABEL)[0]?.size ?? 0;
		const name = await createSnapshot({ includeArtifacts: settings.includeArtifacts, actorId: null, label: SCHEDULE_LABEL, expectedBytes });
		pruneLabel(SCHEDULE_LABEL, settings.keep);
		let copyError = null;
		const dir = copyDir();
		if (dir) {
			try {
				await copySnapshot(name, dir, settings.keep);
			} catch (error) {
				copyError = { key: 'backups.schedule.copyFailed', params: { dir, detail: (error as Error).message } };
				console.error(`[backups] copying ${name} to ${dir} failed:`, (error as Error).message);
			}
		}
		setSetting('backup_last_run', String(now));
		setSetting('backup_last_name', name);
		storeError(copyError);
		return name;
	} catch (error) {
		storeError(error instanceof UserError ? { key: error.key, params: error.params } : { text: (error as Error).message });
		console.error('[backups] scheduled snapshot failed:', (error as Error).message);
		return null;
	} finally {
		running = false;
	}
}

/** Copies a snapshot into `dir` under a temporary name first, then keeps the newest `keep` there. */
async function copySnapshot(name: string, dir: string, keep: number) {
	const partial = path.join(dir, `${name}.partial`);
	await fsp.copyFile(snapshotPath(name), partial);
	await fsp.rename(partial, path.join(dir, name));
	// The names carry the time, so they sort by age.
	const copies = (await fsp.readdir(dir)).filter((file) => isLabelled(file, SCHEDULE_LABEL)).sort().reverse();
	for (const old of copies.slice(keep)) await fsp.rm(path.join(dir, old), { force: true });
}

/** Called once at startup; the timer never keeps the process alive on its own. */
export function startBackupSchedule() {
	// Vite reloads this module in development; one timer is enough.
	const flag = globalThis as { __pcbgitBackupTimer?: boolean };
	if (flag.__pcbgitBackupTimer) return;
	flag.__pcbgitBackupTimer = true;

	const tick = () => {
		const due = nextRun(scheduleSettings(), {
			success: Number(getSetting('backup_last_run', '0')) || null,
			failure: Number(getSetting('backup_last_attempt', '0')) || null
		});
		if (due !== null && Date.now() >= due) void runScheduledSnapshot();
	};
	setInterval(tick, CHECK_EVERY).unref();
	setTimeout(tick, 60_000).unref();
}

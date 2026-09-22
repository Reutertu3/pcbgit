import fs from 'node:fs';
import path from 'node:path';

/**
 * The app never updates itself. It drops a request file into a folder shared
 * with the host, where a systemd path unit runs deploy/update.sh. The script
 * reports back through a status file and a log in the same folder.
 */
const CONTROL_DIR = process.env.PCBGIT_CONTROL_DIR ?? '';

export interface UpdateStatus {
	state: 'running' | 'success' | 'failed';
	message: string;
	started: number;
	finished: number | null;
	from: string;
	to: string;
}

export function updaterEnabled() {
	return CONTROL_DIR !== '' && fs.existsSync(CONTROL_DIR);
}

/** The git commit this image was built from (set by deploy/update.sh). */
export function runningVersion() {
	return process.env.PCBGIT_VERSION ?? 'dev';
}

export function updateState() {
	if (!updaterEnabled()) return null;
	let status: UpdateStatus | null = null;
	try {
		status = JSON.parse(fs.readFileSync(path.join(CONTROL_DIR, 'update-status.json'), 'utf8'));
	} catch {
		// No update has run yet.
	}
	let log = '';
	try {
		const full = fs.readFileSync(path.join(CONTROL_DIR, 'update.log'), 'utf8');
		log = full.length > 20_000 ? `…\n${full.slice(-20_000)}` : full;
	} catch {
		// No log yet.
	}
	return {
		status,
		log,
		requested: fs.existsSync(path.join(CONTROL_DIR, 'update-request'))
	};
}

export function requestUpdate(by: string, force: boolean) {
	if (!updaterEnabled()) throw new Error('Updates are not configured on this server.');
	fs.writeFileSync(
		path.join(CONTROL_DIR, 'update-request'),
		JSON.stringify({ by, force, requested_at: new Date().toISOString() }, null, 1)
	);
}

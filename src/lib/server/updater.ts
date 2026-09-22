import fs from 'node:fs';
import path from 'node:path';
import type { Availability, ChangelogEntry } from '$lib/types';

export type { Availability, ChangelogEntry };

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

/** Release tag of the running commit, when it was built from one. */
export function runningTag() {
	return process.env.PCBGIT_TAG?.trim() || null;
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

/** git@github.com:owner/repo.git or https://github.com/owner/repo(.git) -> web URL. */
export function githubWebUrl(remote: string) {
	const match = /github\.com[:/]([^/\s]+)\/([^/\s]+?)(\.git)?\/?$/.exec(remote);
	return match ? `https://github.com/${match[1]}/${match[2]}` : null;
}

/** What an update would bring, as last recorded by `update.sh --check`. */
export function updateAvailability(): Availability | null {
	if (!updaterEnabled()) return null;
	const checkRequested = fs.existsSync(path.join(CONTROL_DIR, 'check-request'));
	let raw: Partial<Availability> & { remote?: string };
	try {
		raw = JSON.parse(fs.readFileSync(path.join(CONTROL_DIR, 'update-available.json'), 'utf8'));
	} catch {
		// Never checked yet.
		return { checked: 0, ok: true, branch: '', current: '', latest: '', behind: 0, ahead: 0, repoUrl: null, commits: [], checkRequested };
	}

	const repoUrl = raw.remote ? githubWebUrl(raw.remote) : null;
	let commits: ChangelogEntry[] = [];
	try {
		commits = fs
			.readFileSync(path.join(CONTROL_DIR, 'update-commits.txt'), 'utf8')
			.split('\n')
			.filter(Boolean)
			.map((line) => {
				const [sha, short, author, date, ...subject] = line.split('\u001f');
				return {
					sha,
					short,
					author,
					date: Number(date) * 1000,
					subject: subject.join('\u001f'),
					url: repoUrl ? `${repoUrl}/commit/${sha}` : null
				};
			});
	} catch {
		// No commit list yet.
	}

	return {
		checked: (raw.checked ?? 0) * 1000,
		ok: raw.ok !== false,
		branch: raw.branch ?? '',
		current: raw.current ?? '',
		latest: raw.latest ?? '',
		behind: raw.behind ?? 0,
		ahead: raw.ahead ?? 0,
		repoUrl,
		commits,
		checkRequested
	};
}

export function requestCheck() {
	if (!updaterEnabled()) throw new Error('Updates are not configured on this server.');
	fs.writeFileSync(path.join(CONTROL_DIR, 'check-request'), new Date().toISOString());
}

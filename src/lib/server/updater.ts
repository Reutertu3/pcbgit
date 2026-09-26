import fs from 'node:fs';
import path from 'node:path';
import type { Availability, ChangelogEntry, ImageState, UpdateStatus } from '$lib/types';

export type { Availability, ChangelogEntry, UpdateStatus };

/**
 * The app never updates itself. It drops a request file into a folder shared
 * with the host, where a systemd path unit runs deploy/update.sh. The script
 * reports back through a status file and a log in the same folder.
 */
const CONTROL_DIR = process.env.PCBGIT_CONTROL_DIR ?? '';

const IMAGE_STATES: ImageState[] = ['ready', 'building', 'failed', 'missing', 'unreadable', 'local', 'off'];

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

/**
 * Without `release`, update.sh builds the newest master commit on the server (the
 * "Update from GitHub" button); with one, it installs that release's image, as an
 * automatic update would.
 */
export function requestUpdate(by: string, force: boolean, release?: string) {
	if (!updaterEnabled()) throw new Error('Updates are not configured on this server.');
	fs.writeFileSync(
		path.join(CONTROL_DIR, 'update-request'),
		JSON.stringify({ by, force, ...(release ? { release } : {}), requested_at: new Date().toISOString() }, null, 1)
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
	let raw: Partial<Omit<Availability, 'source' | 'image' | 'release' | 'releaseCommit' | 'releaseNew'>> & {
		remote?: string;
		source?: string;
		image?: string;
		release?: string;
		release_commit?: string;
		release_new?: boolean;
	};
	try {
		raw = JSON.parse(fs.readFileSync(path.join(CONTROL_DIR, 'update-available.json'), 'utf8'));
	} catch {
		// Never checked yet.
		return { checked: 0, ok: true, branch: '', current: '', latest: '', behind: 0, ahead: 0, repoUrl: null, commits: [], checkRequested, source: null, release: null, releaseCommit: null, releaseNew: false, image: null };
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
		checkRequested,
		source: raw.source || null,
		release: raw.release || null,
		releaseCommit: raw.release_commit || null,
		releaseNew: raw.release_new === true,
		image: IMAGE_STATES.includes(raw.image as ImageState) ? (raw.image as ImageState) : null
	};
}

/**
 * Automatic updates: update.sh --check (hourly) requests the newest release itself
 * when it can be installed. The switch is a file the host script looks for.
 */
export function autoUpdateEnabled() {
	return updaterEnabled() && fs.existsSync(path.join(CONTROL_DIR, 'auto-update'));
}

export function setAutoUpdate(on: boolean, by: string) {
	if (!updaterEnabled()) throw new Error('Updates are not configured on this server.');
	const file = path.join(CONTROL_DIR, 'auto-update');
	if (on) fs.writeFileSync(file, JSON.stringify({ by, enabled_at: new Date().toISOString() }, null, 1));
	else fs.rmSync(file, { force: true });
}

export function requestCheck() {
	if (!updaterEnabled()) throw new Error('Updates are not configured on this server.');
	fs.writeFileSync(path.join(CONTROL_DIR, 'check-request'), new Date().toISOString());
}

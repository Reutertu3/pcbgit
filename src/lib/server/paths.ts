import fs from 'node:fs';
import path from 'node:path';

/** Everything mutable lives under DATA_DIR so a single docker volume covers it. */
export const DATA_DIR = path.resolve(process.env.PCBHUB_DATA_DIR ?? './data');
export const REPO_DIR = path.join(DATA_DIR, 'repos');
export const ARTIFACT_DIR = path.join(DATA_DIR, 'artifacts');
export const TMP_DIR = path.join(DATA_DIR, 'tmp');
export const DB_PATH = path.join(DATA_DIR, 'pcbhub.db');
export const BACKUP_DIR = path.join(DATA_DIR, 'backups');

export function ensureDirs() {
	for (const dir of [DATA_DIR, REPO_DIR, ARTIFACT_DIR, TMP_DIR, BACKUP_DIR]) {
		fs.mkdirSync(dir, { recursive: true });
	}
}

/** Bare repository path for a project. Segments are validated by the caller. */
export function repoPath(ownerSlug: string, projectSlug: string) {
	return path.join(REPO_DIR, safeSegment(ownerSlug), `${safeSegment(projectSlug)}.git`);
}

export function artifactDir(commitId: string) {
	return path.join(ARTIFACT_DIR, safeSegment(commitId));
}

/** Rejects anything that could escape the data directory. */
export function safeSegment(value: string) {
	if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value) || value.includes('..')) {
		throw new Error(`Unsafe path segment: ${value}`);
	}
	return value;
}

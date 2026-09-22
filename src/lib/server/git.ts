import { execFile } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { TMP_DIR, repoPath } from './paths';

const exec = promisify(execFile);

/** Field separator that will not appear in commit metadata. */
const SEP = '\u001f';
const REC = '\u001e';

export interface GitCommit {
	sha: string;
	message: string;
	authorName: string;
	authorEmail: string;
	committedAt: number;
}

async function git(repo: string, args: string[], opts: { cwd?: string; maxBuffer?: number } = {}) {
	const { stdout } = await exec('git', ['--git-dir', repo, ...args], {
		cwd: opts.cwd,
		maxBuffer: opts.maxBuffer ?? 32 * 1024 * 1024,
		env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
	});
	return stdout;
}

export async function initRepo(ownerSlug: string, projectSlug: string, defaultBranch = 'main') {
	const repo = repoPath(ownerSlug, projectSlug);
	await fsp.mkdir(path.dirname(repo), { recursive: true });
	if (!fs.existsSync(repo)) {
		await exec('git', ['init', '--bare', `--initial-branch=${defaultBranch}`, repo]);
		// Lets `git clone http://.../x.git` work without a running daemon.
		await fsp.writeFile(path.join(repo, 'git-daemon-export-ok'), '');
		await git(repo, ['config', 'http.receivepack', 'true']);
		await git(repo, ['config', 'receive.denyCurrentBranch', 'ignore']);
	}
	return repo;
}

export async function deleteRepo(ownerSlug: string, projectSlug: string) {
	await fsp.rm(repoPath(ownerSlug, projectSlug), { recursive: true, force: true });
}

export function repoExists(ownerSlug: string, projectSlug: string) {
	return fs.existsSync(repoPath(ownerSlug, projectSlug));
}

export async function resolveRef(repo: string, ref: string) {
	try {
		return (await git(repo, ['rev-parse', '--verify', `${ref}^{commit}`])).trim();
	} catch {
		return null;
	}
}

export async function listCommits(repo: string, ref: string, limit = 100): Promise<GitCommit[]> {
	const format = ['%H', '%s', '%an', '%ae', '%ct'].join(SEP) + REC;
	let out: string;
	try {
		out = await git(repo, ['log', `--format=${format}`, `--max-count=${limit}`, ref]);
	} catch {
		return [];
	}
	return out
		.split(REC)
		.map((chunk) => chunk.replace(/^\n/, ''))
		.filter((chunk) => chunk.trim())
		.map((chunk) => {
			const [sha, message, authorName, authorEmail, ts] = chunk.split(SEP);
			return {
				sha,
				message,
				authorName,
				authorEmail,
				committedAt: Number(ts) * 1000
			};
		});
}

/** Flat list of every path in a commit, with blob sizes. */
export async function listTree(repo: string, sha: string) {
	// --format already reports size; adding --long makes git refuse the combination.
	const out = await git(repo, ['ls-tree', '-r', '--format=%(objectsize)\t%(path)', sha]);
	return out
		.split('\n')
		.filter(Boolean)
		.map((line) => {
			const [size, ...rest] = line.split('\t');
			return { path: rest.join('\t'), size: Number(size) || 0 };
		})
		.sort((a, b) => a.path.localeCompare(b.path));
}

export async function readBlob(repo: string, sha: string, filePath: string) {
	return git(repo, ['show', `${sha}:${filePath}`]);
}

/** Extracts a commit's tree into a fresh temp directory. Caller removes it. */
export async function exportTree(repo: string, sha: string, label = 'work') {
	const dir = await fsp.mkdtemp(path.join(TMP_DIR, `${label}-`));
	const archive = await exec('git', ['--git-dir', repo, 'archive', '--format=tar', sha], {
		encoding: 'buffer',
		maxBuffer: 512 * 1024 * 1024
	});
	const tarPath = path.join(dir, '.tree.tar');
	await fsp.writeFile(tarPath, archive.stdout as unknown as Buffer);
	await exec('tar', ['-xf', tarPath, '-C', dir]);
	await fsp.rm(tarPath, { force: true });
	return dir;
}

export interface UploadFile {
	path: string;
	data: Buffer;
}

/**
 * Writes `files` as a single commit on `branch`, replacing the tree wholesale.
 * Used by the web upload path so uploads and pushes produce identical history.
 */
export async function commitFiles(
	repo: string,
	files: UploadFile[],
	opts: { message: string; authorName: string; authorEmail: string; branch: string }
) {
	const work = await fsp.mkdtemp(path.join(TMP_DIR, 'upload-'));
	try {
		const index = path.join(work, 'index');
		const tree = path.join(work, 'tree');
		await fsp.mkdir(tree, { recursive: true });

		for (const file of files) {
			const target = path.join(tree, file.path);
			if (!target.startsWith(tree + path.sep)) throw new Error(`Unsafe path: ${file.path}`);
			await fsp.mkdir(path.dirname(target), { recursive: true });
			await fsp.writeFile(target, file.data);
		}

		const env = {
			...process.env,
			GIT_DIR: repo,
			GIT_WORK_TREE: tree,
			GIT_INDEX_FILE: index,
			GIT_AUTHOR_NAME: opts.authorName,
			GIT_AUTHOR_EMAIL: opts.authorEmail,
			GIT_COMMITTER_NAME: opts.authorName,
			GIT_COMMITTER_EMAIL: opts.authorEmail
		};
		const run = (args: string[]) => exec('git', args, { env, maxBuffer: 32 * 1024 * 1024 });

		await run(['add', '-A', '.']);
		const { stdout: treeSha } = await run(['write-tree']);
		const parent = await resolveRef(repo, opts.branch);
		const commitArgs = ['commit-tree', treeSha.trim(), '-m', opts.message];
		if (parent) commitArgs.push('-p', parent);
		const { stdout: sha } = await run(commitArgs);
		await run(['update-ref', `refs/heads/${opts.branch}`, sha.trim()]);
		await run(['symbolic-ref', 'HEAD', `refs/heads/${opts.branch}`]);
		return sha.trim();
	} finally {
		await fsp.rm(work, { recursive: true, force: true });
	}
}


import { error } from '@sveltejs/kit';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { RequestHandler } from './$types';
import { get } from '$lib/server/db';
import { repoPath } from '$lib/server/paths';
import { canView, getProject } from '$lib/server/projects';

const exec = promisify(execFile);

/** Streams `git archive` output so source downloads need no temp files. */
export const GET: RequestHandler = async ({ params, locals }) => {
	const match = /^([0-9a-f]{7,40})\.zip$/i.exec(params.file);
	if (!match) error(400, 'Expected <sha>.zip');

	const project = getProject(params.owner, params.project);
	if (!project || !canView(project, locals.user)) error(404, 'Board not found');

	const commit = get<{ sha: string }>(
		'SELECT sha FROM commits WHERE project_id = ? AND sha LIKE ?',
		project.id,
		`${match[1]}%`
	);
	if (!commit) error(404, 'Version not found');

	const prefix = `${project.slug}-${commit.sha.slice(0, 7)}`;
	const { stdout } = await exec(
		'git',
		['--git-dir', repoPath(project.owner_username, project.slug), 'archive', '--format=zip', `--prefix=${prefix}/`, commit.sha],
		{ encoding: 'buffer', maxBuffer: 512 * 1024 * 1024 }
	);

	return new Response(stdout as unknown as BodyInit, {
		headers: {
			'Content-Type': 'application/zip',
			'Content-Disposition': `attachment; filename="${prefix}.zip"`,
			'Content-Length': String((stdout as unknown as Buffer).length)
		}
	});
};

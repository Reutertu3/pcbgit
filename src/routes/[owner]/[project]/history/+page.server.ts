import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { all, get } from '$lib/server/db';
import { canEdit, getProject, listProjectCommits, syncCommits } from '$lib/server/projects';
import { enqueueRender } from '$lib/server/render/worker';
import { kicadVersion } from '$lib/server/render/kicad';

interface JobRow {
	commit_id: string;
	status: string;
	attempts: number;
	error: string;
	log?: string;
	queued_at: number;
	started_at: number | null;
	finished_at: number | null;
}

export const load: PageServerLoad = async ({ parent, url }) => {
	const { project } = await parent();

	const logFor = url.searchParams.get('log');
	const job = logFor
		? get<JobRow>(
				`SELECT j.* FROM render_jobs j JOIN commits c ON c.id = j.commit_id
				 WHERE j.commit_id = ? AND c.project_id = ? ORDER BY j.queued_at DESC LIMIT 1`,
				logFor,
				project.id
			)
		: null;

	return {
		commits: listProjectCommits(project.id, 200),
		jobs: all<JobRow>(
			`SELECT j.commit_id, j.status, j.attempts, j.error, j.queued_at, j.started_at, j.finished_at
			 FROM render_jobs j WHERE j.project_id = ? ORDER BY j.queued_at DESC LIMIT 200`,
			project.id
		),
		openLog: logFor,
		job,
		kicadAvailable: (await kicadVersion()) !== null
	};
};

export const actions: Actions = {
	rerender: async ({ params, locals, request }) => {
		const project = getProject(params.owner, params.project);
		if (!project) error(404, 'Board not found');
		if (!canEdit(project, locals.user)) return fail(403, { error: 'You cannot re-render this board.' });

		const commitId = String((await request.formData()).get('commit') ?? '');
		const commit = get<{ id: string }>(
			'SELECT id FROM commits WHERE id = ? AND project_id = ?',
			commitId,
			project.id
		);
		if (!commit) return fail(404, { error: 'Version not found.' });

		enqueueRender(project.id, commit.id);
		return { success: true, message: 'Re-render queued.' };
	},

	resync: async ({ params, locals }) => {
		const project = getProject(params.owner, params.project);
		if (!project) error(404, 'Board not found');
		if (!canEdit(project, locals.user)) return fail(403, { error: 'You cannot sync this board.' });

		const result = await syncCommits(project, project.owner_username);
		return {
			success: true,
			message: result.added
				? `Found ${result.added} new commit${result.added === 1 ? '' : 's'}.`
				: 'Already up to date with the repository.'
		};
	}
};

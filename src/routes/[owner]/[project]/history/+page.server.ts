import { error, fail } from '@sveltejs/kit';
import { translate } from '$lib/i18n';
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
		if (!project) error(404, 'error.boardNotFound');
		if (!canEdit(project, locals.user)) return fail(403, { error: translate(locals.locale, 'history.error.rerender') });

		const commitId = String((await request.formData()).get('commit') ?? '');
		const commit = get<{ id: string }>(
			'SELECT id FROM commits WHERE id = ? AND project_id = ?',
			commitId,
			project.id
		);
		if (!commit) return fail(404, { error: translate(locals.locale, 'error.versionNotFound') });

		enqueueRender(project.id, commit.id);
		return { success: true, message: translate(locals.locale, 'history.rerenderQueued') };
	},

	resync: async ({ params, locals }) => {
		const project = getProject(params.owner, params.project);
		if (!project) error(404, 'error.boardNotFound');
		if (!canEdit(project, locals.user)) return fail(403, { error: translate(locals.locale, 'history.error.sync') });

		const result = await syncCommits(project, project.owner_username);
		return {
			success: true,
			message: result.added
				? translate(locals.locale, 'history.synced', { count: result.added })
				: translate(locals.locale, 'history.alreadySynced')
		};
	}
};

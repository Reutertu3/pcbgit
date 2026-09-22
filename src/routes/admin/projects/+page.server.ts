import { fail } from '@sveltejs/kit';
import { translate } from '$lib/i18n';
import type { Actions, PageServerLoad } from './$types';
import { all, audit, get, now, run } from '$lib/server/db';
import { deleteProject, getProjectById, syncCommits } from '$lib/server/projects';
import { enqueueRender } from '$lib/server/render/worker';

interface AdminProjectRow {
	id: string;
	slug: string;
	name: string;
	visibility: 'public' | 'private';
	license: string;
	updated_at: number;
	head_commit_id: string | null;
	owner_username: string;
	commit_count: number;
	star_count: number;
	artifact_bytes: number;
	head_status: string | null;
}

export const load: PageServerLoad = async ({ url }) => {
	const search = url.searchParams.get('q') ?? '';
	const term = `%${search}%`;

	return {
		projects: all<AdminProjectRow>(
			`SELECT p.id, p.slug, p.name, p.visibility, p.license, p.updated_at, p.head_commit_id,
			   u.username AS owner_username,
			   (SELECT COUNT(*) FROM commits c WHERE c.project_id = p.id) AS commit_count,
			   (SELECT COUNT(*) FROM stars s WHERE s.project_id = p.id) AS star_count,
			   (SELECT COALESCE(SUM(a.size_bytes), 0) FROM artifacts a
			      JOIN commits c ON c.id = a.commit_id WHERE c.project_id = p.id) AS artifact_bytes,
			   hc.render_status AS head_status
			 FROM projects p
			 JOIN users u ON u.id = p.owner_id
			 LEFT JOIN commits hc ON hc.id = p.head_commit_id
			 WHERE (? = '' OR p.slug LIKE ? OR p.name LIKE ? OR u.username LIKE ?)
			 ORDER BY p.updated_at DESC`,
			search,
			term,
			term,
			term
		),
		search
	};
};

export const actions: Actions = {
	setVisibility: async ({ request, locals }) => {
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const visibility = form.get('visibility') === 'private' ? 'private' : 'public';
		run('UPDATE projects SET visibility = ?, updated_at = ? WHERE id = ?', visibility, now(), id);
		audit(locals.user!.id, 'admin.project_visibility', id, visibility);
		return { success: true, message: translate(locals.locale, visibility === 'private' ? 'adminBoards.nowPrivate' : 'adminBoards.nowPublic') };
	},

	rerender: async ({ request, locals }) => {
		const id = String((await request.formData()).get('id') ?? '');
		const project = getProjectById(id);
		if (!project) return fail(404, { error: translate(locals.locale, 'error.boardNotFound') });
		if (!project.head_commit_id) return fail(400, { error: translate(locals.locale, 'adminBoards.error.noVersions') });

		enqueueRender(project.id, project.head_commit_id);
		audit(locals.user!.id, 'admin.project_rerender', `${project.owner_username}/${project.slug}`);
		return { success: true, message: translate(locals.locale, 'history.rerenderQueued') };
	},

	resync: async ({ request, locals }) => {
		const id = String((await request.formData()).get('id') ?? '');
		const project = getProjectById(id);
		if (!project) return fail(404, { error: translate(locals.locale, 'error.boardNotFound') });

		const result = await syncCommits(project, project.owner_username);
		audit(locals.user!.id, 'admin.project_resync', `${project.owner_username}/${project.slug}`);
		return {
			success: true,
			message: result.added ? translate(locals.locale, 'history.synced', { count: result.added }) : translate(locals.locale, 'history.alreadySynced')
		};
	},

	rerenderFailed: async ({ locals }) => {
		const failed = all<{ id: string; project_id: string }>(
			"SELECT id, project_id FROM commits WHERE render_status = 'failed'"
		);
		for (const commit of failed) enqueueRender(commit.project_id, commit.id);
		audit(locals.user!.id, 'admin.rerender_failed', String(failed.length));
		return { success: true, message: translate(locals.locale, 'adminBoards.queuedFailed', { count: failed.length }) };
	},

	delete: async ({ request, locals }) => {
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const project = getProjectById(id);
		if (!project) return fail(404, { error: translate(locals.locale, 'error.boardNotFound') });
		if (String(form.get('confirm') ?? '') !== project.slug) {
			return fail(400, { error: translate(locals.locale, 'boardForm.error.confirm', { slug: project.slug }) });
		}

		await deleteProject(project, locals.user!.id);
		return { success: true, message: translate(locals.locale, 'adminBoards.deleted', { name: `${project.owner_username}/${project.slug}` }) };
	}
};

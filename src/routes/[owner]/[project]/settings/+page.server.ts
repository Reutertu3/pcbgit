import { error, fail, redirect } from '@sveltejs/kit';
import { translate } from '$lib/i18n';
import type { Actions, PageServerLoad } from './$types';
import { audit } from '$lib/server/db';
import { commitFiles } from '$lib/server/git';
import { repoPath } from '$lib/server/paths';
import {
	LICENSES,
	addCollaborator,
	canEdit,
	collaboratorCandidates,
	deleteProject,
	isOwner,
	listCollaborators,
	removeCollaborator,
	getProject,
	listTags,
	setProjectTags,
	syncCommits,
	updateProject
} from '$lib/server/projects';
import { LimitError, checkStorage, takeWrite } from '$lib/server/limits';
import {
	MAX_UPLOAD_BYTES,
	UploadError,
	projectProblem,
	filesFromZip
} from '$lib/server/upload';

function requireEditable(owner: string, slug: string, user: App.Locals['user']) {
	const project = getProject(owner, slug);
	if (!project) error(404, 'error.boardNotFound');
	if (!canEdit(project, user)) error(403, 'error.noSettingsAccess');
	return project;
}

/** Deleting the board and choosing its collaborators stay with the owner (and admins). */
function requireOwner(owner: string, slug: string, user: App.Locals['user']) {
	const project = requireEditable(owner, slug, user);
	if (!isOwner(project, user)) error(403, 'error.ownerOnly');
	return project;
}

export const load: PageServerLoad = async ({ params, locals, parent, url }) => {
	const { editable } = await parent();
	if (!editable) redirect(303, `/${params.owner}/${params.project}`);

	const project = requireEditable(params.owner, params.project, locals.user);
	return {
		licenses: LICENSES,
		allTags: listTags(),
		isOwner: isOwner(project, locals.user),
		collaborators: listCollaborators(project.id),
		candidates: collaboratorCandidates(project),
		cloneUrl: `${url.origin}/git/${project.owner_username}/${project.slug}.git`
	};
};

export const actions: Actions = {
	save: async ({ request, params, locals }) => {
		const project = requireEditable(params.owner, params.project, locals.user);
		const form = await request.formData();

		const name = String(form.get('name') ?? '').trim();
		if (name.length < 2) return fail(400, { error: translate(locals.locale, 'boardForm.error.name') });

		updateProject(project.id, {
			name,
			description: String(form.get('description') ?? '').trim().slice(0, 500),
			visibility: form.get('visibility') === 'private' ? 'private' : 'public',
			license: String(form.get('license') ?? ''),
			source_url: String(form.get('source_url') ?? '').trim().slice(0, 300),
			default_branch: String(form.get('default_branch') ?? 'main').trim() || 'main'
		});

		// Only pre-defined tags can be chosen; unknown values are dropped.
		setProjectTags(project.id, form.getAll('tags').map(String));

		audit(locals.user!.id, 'project.update', `${project.owner_username}/${project.slug}`);
		return { success: true, saved: true, message: translate(locals.locale, 'boardForm.saved') };
	},

	upload: async ({ request, params, locals }) => {
		const project = requireEditable(params.owner, params.project, locals.user);
		const form = await request.formData();
		const archive = form.get('archive');
		const message = String(form.get('message') ?? '').trim() || 'Upload new version';

		if (!(archive instanceof File) || archive.size === 0) {
			return fail(400, { error: translate(locals.locale, 'boardForm.error.chooseZip') });
		}
		if (archive.size > MAX_UPLOAD_BYTES) {
			return fail(413, { error: translate(locals.locale, 'upload.error.archiveTooLarge') });
		}

		let files;
		try {
			files = filesFromZip(Buffer.from(await archive.arrayBuffer()));
		} catch (thrown) {
			return fail(400, {
				error: thrown instanceof UploadError ? thrown.in(locals.locale) : translate(locals.locale, 'upload.error.unreadable')
			});
		}
		const problem = projectProblem(files);
		if (problem) return fail(400, { error: translate(locals.locale, problem) });

		// Storage is the owner's, the hourly count is whoever uploads.
		try {
			await checkStorage(project.owner_id);
			takeWrite(locals.user!);
		} catch (error) {
			if (error instanceof LimitError) return fail(403, { error: error.in(locals.locale) });
			throw error;
		}

		await commitFiles(repoPath(project.owner_username, project.slug), files, {
			message,
			authorName: locals.user!.display_name || locals.user!.username,
			authorEmail: locals.user!.email,
			branch: project.default_branch
		});
		const result = await syncCommits(project, project.owner_username, locals.user!.id);

		return {
			success: true,
			message: result.added
				? translate(locals.locale, 'boardForm.uploaded')
				: translate(locals.locale, 'boardForm.noChanges')
		};
	},

	addCollaborator: async ({ request, params, locals }) => {
		const project = requireOwner(params.owner, params.project, locals.user);
		const username = String((await request.formData()).get('username') ?? '').trim();
		// `collaborators` keeps the feedback in that section instead of at the top of the page.
		if (!username) return fail(400, { collaborators: true, error: translate(locals.locale, 'collaborators.error.pick') });
		const refused = addCollaborator(project, username, locals.user!.id);
		if (refused) return fail(400, { collaborators: true, error: translate(locals.locale, refused, { username }) });
		return { collaborators: true, success: true, message: translate(locals.locale, 'collaborators.added', { username }) };
	},

	removeCollaborator: async ({ request, params, locals }) => {
		const project = requireOwner(params.owner, params.project, locals.user);
		removeCollaborator(project, String((await request.formData()).get('user_id') ?? ''), locals.user!.id);
		return { collaborators: true, success: true, message: translate(locals.locale, 'collaborators.removed') };
	},

	delete: async ({ request, params, locals }) => {
		const project = requireOwner(params.owner, params.project, locals.user);
		const confirmation = String((await request.formData()).get('confirm') ?? '');
		if (confirmation !== project.slug) {
			return fail(400, { error: translate(locals.locale, 'boardForm.error.confirm', { slug: project.slug }) });
		}

		await deleteProject(project, locals.user!.id);
		redirect(303, `/${project.owner_username}`);
	}
};

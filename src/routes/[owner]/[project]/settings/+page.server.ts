import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { audit } from '$lib/server/db';
import { commitFiles } from '$lib/server/git';
import { repoPath } from '$lib/server/paths';
import {
	LICENSES,
	canEdit,
	deleteProject,
	getProject,
	listTags,
	setProjectTags,
	syncCommits,
	updateProject
} from '$lib/server/projects';
import {
	MAX_UPLOAD_BYTES,
	UploadError,
	containsKicadProject,
	filesFromZip
} from '$lib/server/upload';

function requireEditable(owner: string, slug: string, user: App.Locals['user']) {
	const project = getProject(owner, slug);
	if (!project) error(404, 'Board not found');
	if (!canEdit(project, user)) error(403, 'You do not have access to these settings');
	return project;
}

export const load: PageServerLoad = async ({ params, locals, parent, url }) => {
	const { editable } = await parent();
	if (!editable) redirect(303, `/${params.owner}/${params.project}`);

	const project = requireEditable(params.owner, params.project, locals.user);
	return {
		licenses: LICENSES,
		allTags: listTags(),
		cloneUrl: `${url.origin}/git/${project.owner_username}/${project.slug}.git`
	};
};

export const actions: Actions = {
	save: async ({ request, params, locals }) => {
		const project = requireEditable(params.owner, params.project, locals.user);
		const form = await request.formData();

		const name = String(form.get('name') ?? '').trim();
		if (name.length < 2) return fail(400, { error: 'Give the board a name.' });

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
		return { success: true, message: 'Settings saved.' };
	},

	upload: async ({ request, params, locals }) => {
		const project = requireEditable(params.owner, params.project, locals.user);
		const form = await request.formData();
		const archive = form.get('archive');
		const message = String(form.get('message') ?? '').trim() || 'Upload new version';

		if (!(archive instanceof File) || archive.size === 0) {
			return fail(400, { error: 'Choose a ZIP file to upload.' });
		}
		if (archive.size > MAX_UPLOAD_BYTES) {
			return fail(413, { error: 'Archive is larger than 200 MB.' });
		}

		let files;
		try {
			files = filesFromZip(Buffer.from(await archive.arrayBuffer()));
		} catch (thrown) {
			return fail(400, {
				error: thrown instanceof UploadError ? thrown.message : 'Could not read the archive.'
			});
		}
		if (!containsKicadProject(files)) {
			return fail(400, { error: 'No .kicad_pcb or .kicad_sch file found in that archive.' });
		}

		await commitFiles(repoPath(project.owner_username, project.slug), files, {
			message,
			authorName: locals.user!.display_name || locals.user!.username,
			authorEmail: locals.user!.email,
			branch: project.default_branch
		});
		const result = await syncCommits(project, project.owner_username);

		return {
			success: true,
			message: result.added
				? 'New version uploaded. Rendering has started.'
				: 'Upload produced no changes — the files are identical to the current version.'
		};
	},

	delete: async ({ request, params, locals }) => {
		const project = requireEditable(params.owner, params.project, locals.user);
		const confirmation = String((await request.formData()).get('confirm') ?? '');
		if (confirmation !== project.slug) {
			return fail(400, { error: `Type "${project.slug}" to confirm deletion.` });
		}

		await deleteProject(project, locals.user!.id);
		redirect(303, `/${project.owner_username}`);
	}
};

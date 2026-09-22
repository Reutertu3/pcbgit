import { fail, redirect } from '@sveltejs/kit';
import { translate } from '$lib/i18n';
import type { Actions, PageServerLoad } from './$types';
import { get } from '$lib/server/db';
import { commitFiles } from '$lib/server/git';
import { repoPath } from '$lib/server/paths';
import { LICENSES, createProject, listTags, slugify, syncCommits, validateSlug } from '$lib/server/projects';
import {
	MAX_UPLOAD_BYTES,
	UploadError,
	containsKicadProject,
	filesFromZip
} from '$lib/server/upload';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) redirect(303, `/login?next=${encodeURIComponent(url.pathname)}`);
	return { licenses: LICENSES, allTags: listTags() };
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const form = await request.formData();
		const blank = {
			name: '',
			slug: '',
			description: '',
			visibility: 'public',
			license: '',
			source_url: '',
			tags: [] as string[]
		};

		const user = locals.user;
		if (!user) return fail(401, { error: translate(locals.locale, 'error.signInFirst'), ...blank });

		const name = String(form.get('name') ?? '').trim();
		const slug = slugify(String(form.get('slug') ?? '') || name);
		const description = String(form.get('description') ?? '').trim().slice(0, 500);
		const visibility = form.get('visibility') === 'private' ? 'private' : 'public';
		const license = String(form.get('license') ?? '');
		const sourceUrl = String(form.get('source_url') ?? '').trim().slice(0, 300);
		// Checkbox slugs; setProjectTags ignores anything that is not an existing tag.
		const tags = form.getAll('tags').map(String);

		const values = { name, slug, description, visibility, license, source_url: sourceUrl, tags };

		if (name.length < 2) return fail(400, { error: translate(locals.locale, 'boardForm.error.name'), ...values });
		const slugError = validateSlug(slug);
		if (slugError) return fail(400, { error: translate(locals.locale, slugError), ...values });
		if (get('SELECT 1 AS x FROM projects WHERE owner_id = ? AND slug = ?', user.id, slug)) {
			return fail(409, { error: translate(locals.locale, 'newBoard.error.exists', { slug }), ...values });
		}

		const archive = form.get('archive');
		let files: { path: string; data: Buffer }[] = [];

		if (archive instanceof File && archive.size > 0) {
			if (archive.size > MAX_UPLOAD_BYTES) {
				return fail(413, { error: translate(locals.locale, 'upload.error.archiveTooLarge'), ...values });
			}
			try {
				files = filesFromZip(Buffer.from(await archive.arrayBuffer()));
			} catch (error) {
				const message = error instanceof UploadError ? error.in(locals.locale) : translate(locals.locale, 'upload.error.unreadable');
				return fail(400, { error: message, ...values });
			}
			if (!containsKicadProject(files)) {
				return fail(400, {
					error: translate(locals.locale, 'upload.error.noKicad'),
					...values
				});
			}
		}

		const project = await createProject({
			owner: user,
			slug,
			name,
			description,
			visibility,
			license,
			sourceUrl,
			tags
		});

		if (files.length) {
			await commitFiles(repoPath(user.username, slug), files, {
				message: 'Initial upload',
				authorName: user.display_name || user.username,
				authorEmail: user.email,
				branch: project.default_branch
			});
			await syncCommits(project, user.username);
		}

		redirect(303, `/${user.username}/${slug}`);
	}
};

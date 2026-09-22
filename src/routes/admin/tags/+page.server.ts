import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { audit, count, get, newId, now, run } from '$lib/server/db';
import { listTags, slugify } from '$lib/server/projects';

const CATEGORIES = ['general', 'component', 'interface', 'domain', 'process'];

export const load: PageServerLoad = async () => ({ tags: listTags(), categories: CATEGORIES });

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		const category = CATEGORIES.includes(String(form.get('category'))) ? String(form.get('category')) : 'general';
		const description = String(form.get('description') ?? '').trim().slice(0, 200);
		const slug = slugify(name);

		if (!slug) return fail(400, { error: 'Give the tag a name.' });
		if (get('SELECT 1 AS x FROM tags WHERE slug = ?', slug)) {
			return fail(409, { error: `A tag "${slug}" already exists.` });
		}

		run(
			'INSERT INTO tags (id, slug, name, category, description, created_at) VALUES (?,?,?,?,?,?)',
			newId(),
			slug,
			name.slice(0, 40),
			category,
			description,
			now()
		);
		audit(locals.user!.id, 'admin.tag_create', slug);
		return { success: true, message: `Created tag "${name}".` };
	},

	update: async ({ request, locals }) => {
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const name = String(form.get('name') ?? '').trim();
		const category = CATEGORIES.includes(String(form.get('category'))) ? String(form.get('category')) : 'general';
		if (!name) return fail(400, { error: 'Tag name cannot be empty.' });

		run(
			'UPDATE tags SET name = ?, category = ?, description = ? WHERE id = ?',
			name.slice(0, 40),
			category,
			String(form.get('description') ?? '').trim().slice(0, 200),
			id
		);
		audit(locals.user!.id, 'admin.tag_update', name);
		return { success: true, message: 'Tag updated.' };
	},

	delete: async ({ request, locals }) => {
		const id = String((await request.formData()).get('id') ?? '');
		const tag = get<{ slug: string }>('SELECT slug FROM tags WHERE id = ?', id);
		// project_tags cascades, so the tag simply disappears from every board.
		run('DELETE FROM tags WHERE id = ?', id);
		audit(locals.user!.id, 'admin.tag_delete', tag?.slug ?? id);
		return { success: true, message: 'Tag deleted.' };
	},

	prune: async ({ locals }) => {
		const removed = run(
			'DELETE FROM tags WHERE NOT EXISTS (SELECT 1 FROM project_tags pt WHERE pt.tag_id = tags.id)'
		);
		audit(locals.user!.id, 'admin.tag_prune', String(removed.changes));
		return { success: true, message: `Removed ${removed.changes} unused tag(s).` };
	}
};

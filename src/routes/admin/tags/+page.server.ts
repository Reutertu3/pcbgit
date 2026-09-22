import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { audit, count, get, newId, now, run } from '$lib/server/db';
import { CATEGORY_COLORS, isTagColor, listTags, slugify } from '$lib/server/projects';

const CATEGORIES = ['general', 'component', 'interface', 'domain', 'process'];

export const load: PageServerLoad = async () => ({
	tags: listTags(),
	categories: CATEGORIES,
	categoryColors: CATEGORY_COLORS
});

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		const category = CATEGORIES.includes(String(form.get('category'))) ? String(form.get('category')) : 'general';
		const description = String(form.get('description') ?? '').trim().slice(0, 200);
		const color = String(form.get('color') ?? '');
		const slug = slugify(name);
		if (!isTagColor(color)) return fail(400, { error: 'Pick a colour for the tag.' });

		if (!slug) return fail(400, { error: 'Give the tag a name.' });
		if (get('SELECT 1 AS x FROM tags WHERE slug = ?', slug)) {
			return fail(409, { error: `A tag "${slug}" already exists.` });
		}

		run(
			'INSERT INTO tags (id, slug, name, category, color, description, created_at) VALUES (?,?,?,?,?,?,?)',
			newId(),
			slug,
			name.slice(0, 40),
			category,
			color,
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
		const color = String(form.get('color') ?? '');
		if (!name) return fail(400, { error: 'Tag name cannot be empty.' });
		if (!isTagColor(color)) return fail(400, { error: 'Pick a colour for the tag.' });

		run(
			'UPDATE tags SET name = ?, category = ?, color = ?, description = ? WHERE id = ?',
			name.slice(0, 40),
			category,
			color,
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

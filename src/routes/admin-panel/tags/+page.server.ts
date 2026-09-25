import { fail } from '@sveltejs/kit';
import { translate } from '$lib/i18n';
import type { Actions, PageServerLoad } from './$types';
import { audit, count, get, newId, now, run } from '$lib/server/db';
import {
	FALLBACK_CATEGORY,
	createTagCategory,
	deleteTagCategory,
	isTagCategory,
	isTagColor,
	listTagCategories,
	listTags,
	moveTagCategory,
	slugify,
	updateTagCategory
} from '$lib/server/projects';

export const load: PageServerLoad = async () => ({
	tags: listTags(),
	categories: listTagCategories(),
	fallbackCategory: FALLBACK_CATEGORY
});

/** The category a form names, if it exists; otherwise the fallback. */
function formCategory(form: FormData) {
	const category = String(form.get('category') ?? '');
	return isTagCategory(category) ? category : FALLBACK_CATEGORY;
}

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		const category = formCategory(form);
		const description = String(form.get('description') ?? '').trim().slice(0, 200);
		const color = String(form.get('color') ?? '');
		const slug = slugify(name);
		if (!isTagColor(color)) return fail(400, { error: translate(locals.locale, 'adminTags.error.colour') });

		if (!slug) return fail(400, { error: translate(locals.locale, 'adminTags.error.name') });
		if (get('SELECT 1 AS x FROM tags WHERE slug = ?', slug)) {
			return fail(409, { error: translate(locals.locale, 'adminTags.error.exists', { slug }) });
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
		return { success: true, message: translate(locals.locale, 'adminTags.created', { name }) };
	},

	update: async ({ request, locals }) => {
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const name = String(form.get('name') ?? '').trim();
		const category = formCategory(form);
		const color = String(form.get('color') ?? '');
		if (!name) return fail(400, { error: translate(locals.locale, 'adminTags.error.name') });
		if (!isTagColor(color)) return fail(400, { error: translate(locals.locale, 'adminTags.error.colour') });

		run(
			'UPDATE tags SET name = ?, category = ?, color = ?, description = ? WHERE id = ?',
			name.slice(0, 40),
			category,
			color,
			String(form.get('description') ?? '').trim().slice(0, 200),
			id
		);
		audit(locals.user!.id, 'admin.tag_update', name);
		return { success: true, message: translate(locals.locale, 'adminTags.updated') };
	},

	delete: async ({ request, locals }) => {
		const id = String((await request.formData()).get('id') ?? '');
		const tag = get<{ slug: string }>('SELECT slug FROM tags WHERE id = ?', id);
		// project_tags cascades, so the tag simply disappears from every board.
		run('DELETE FROM tags WHERE id = ?', id);
		audit(locals.user!.id, 'admin.tag_delete', tag?.slug ?? id);
		return { success: true, message: translate(locals.locale, 'adminTags.deleted') };
	},

	createCategory: async ({ request, locals }) => {
		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		const color = String(form.get('color') ?? '');
		if (!isTagColor(color)) return fail(400, { error: translate(locals.locale, 'adminTags.error.colour') });
		const created = createTagCategory(name, color);
		if (created.error) return fail(400, { error: translate(locals.locale, created.error, { name }) });
		audit(locals.user!.id, 'admin.tag_category_create', created.id!);
		return { success: true, message: translate(locals.locale, 'adminTags.categoryCreated', { name }) };
	},

	updateCategory: async ({ request, locals }) => {
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const color = String(form.get('color') ?? '');
		if (!isTagCategory(id)) return fail(404, { error: translate(locals.locale, 'adminTags.error.noCategory') });
		if (!isTagColor(color)) return fail(400, { error: translate(locals.locale, 'adminTags.error.colour') });
		updateTagCategory(id, String(form.get('name') ?? ''), color);
		audit(locals.user!.id, 'admin.tag_category_update', id);
		return { success: true, message: translate(locals.locale, 'adminTags.categoryUpdated') };
	},

	moveCategory: async ({ request, locals }) => {
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		moveTagCategory(id, form.get('direction') === 'up' ? -1 : 1);
		audit(locals.user!.id, 'admin.tag_category_move', id);
		return { success: true };
	},

	deleteCategory: async ({ request, locals }) => {
		const id = String((await request.formData()).get('id') ?? '');
		if (!deleteTagCategory(id)) return fail(400, { error: translate(locals.locale, 'adminTags.error.fallbackCategory') });
		audit(locals.user!.id, 'admin.tag_category_delete', id);
		return { success: true, message: translate(locals.locale, 'adminTags.categoryDeleted') };
	},

	prune: async ({ locals }) => {
		const removed = run(
			'DELETE FROM tags WHERE NOT EXISTS (SELECT 1 FROM project_tags pt WHERE pt.tag_id = tags.id)'
		);
		audit(locals.user!.id, 'admin.tag_prune', String(removed.changes));
		return { success: true, message: translate(locals.locale, 'adminTags.pruned', { count: Number(removed.changes) }) };
	}
};

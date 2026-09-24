import type { PageServerLoad } from './$types';
import { listTagCategories, listTags } from '$lib/server/projects';

export const load: PageServerLoad = async () => {
	const tags = listTags();
	return {
		groups: listTagCategories()
			.map((category) => ({
				category: category.id,
				name: category.name,
				tags: tags
					.filter((tag) => tag.category === category.id)
					.sort((a, b) => b.project_count - a.project_count || a.name.localeCompare(b.name))
			}))
			.filter((group) => group.tags.length)
	};
};

import type { PageServerLoad } from './$types';
import { listTags } from '$lib/server/projects';

export const load: PageServerLoad = async () => {
	const tags = listTags();
	const categories = ['component', 'interface', 'domain', 'process', 'general'];
	return {
		groups: categories
			.map((category) => ({
				category,
				tags: tags
					.filter((tag) => tag.category === category)
					.sort((a, b) => b.project_count - a.project_count || a.name.localeCompare(b.name))
			}))
			.filter((group) => group.tags.length)
	};
};

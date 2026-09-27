/** Grouping tags by category, for the tag page and the front page's filter. */

interface GroupableTag {
	slug: string;
	name: string;
	category: string;
	project_count: number;
}

interface GroupableCategory {
	id: string;
	/** Empty for a built-in category, whose name is translated. */
	name: string;
}

export interface TagGroup<T> {
	category: string;
	name: string;
	tags: T[];
	/** Tags of this category left out of `tags` (see `topTagGroups`). */
	more: number;
}

const ORDER = {
	/** Most boards first, then by name. */
	popular: (a: GroupableTag, b: GroupableTag) => b.project_count - a.project_count || a.name.localeCompare(b.name),
	name: (a: GroupableTag, b: GroupableTag) => a.name.localeCompare(b.name)
};

/** Tags under their categories, in the categories' order; empty categories are left out. */
export function groupTags<T extends GroupableTag>(
	categories: GroupableCategory[],
	tags: T[],
	order: keyof typeof ORDER = 'popular'
): TagGroup<T>[] {
	return categories
		.map((category) => ({
			category: category.id,
			name: category.name,
			tags: tags.filter((tag) => tag.category === category.id).sort(ORDER[order]),
			more: 0
		}))
		.filter((group) => group.tags.length);
}

/** The tag page: only tags some public board uses, by name. */
export function usedTagGroups<T extends GroupableTag>(categories: GroupableCategory[], tags: T[]) {
	return groupTags(categories, tags.filter((tag) => tag.project_count > 0), 'name');
}

/**
 * The front page's filter: per category the `perCategory` tags on the most boards,
 * leaving out tags no board uses. A tag that is filtered by stays in whatever its
 * rank, so it can always be switched off again.
 */
export function topTagGroups<T extends GroupableTag>(
	categories: GroupableCategory[],
	tags: T[],
	perCategory: number,
	selected: string[] = []
): TagGroup<T>[] {
	const chosen = new Set(selected);
	return groupTags(categories, tags)
		.map((group) => {
			const used = group.tags.filter((tag) => tag.project_count > 0 || chosen.has(tag.slug));
			const shown = used.filter((tag, index) => index < perCategory || chosen.has(tag.slug));
			return { ...group, tags: shown, more: used.length - shown.length };
		})
		.filter((group) => group.tags.length);
}

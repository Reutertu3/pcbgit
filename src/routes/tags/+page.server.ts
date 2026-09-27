import type { PageServerLoad } from './$types';
import { listTagCategories, listTags } from '$lib/server/projects';
import { usedTagGroups } from '$lib/taggroups';

export const load: PageServerLoad = async () => ({
	groups: usedTagGroups(listTagCategories(), listTags())
});

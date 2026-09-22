import type { PageServerLoad } from './$types';
import { schematicSheets } from '$lib/server/projectcontext';

export const load: PageServerLoad = async ({ parent }) => {
	const { commit } = await parent();
	return { sheets: commit ? schematicSheets(commit.id) : [] };
};

import type { PageServerLoad } from './$types';
import { firstArtifactUrl } from '$lib/server/projectcontext';

export const load: PageServerLoad = async ({ parent }) => {
	const { commit } = await parent();
	return { modelUrl: commit ? firstArtifactUrl(commit.id, 'pcb_glb') : null };
};

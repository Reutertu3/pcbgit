import type { PageServerLoad } from './$types';
import { firstArtifactUrl, schematicSheets } from '$lib/server/projectcontext';

export const load: PageServerLoad = async ({ parent }) => {
	const { commit } = await parent();
	return {
		sheets: commit ? schematicSheets(commit.id) : [],
		// All sheets in one file; versions rendered before the PDF step have none.
		pdf: commit ? firstArtifactUrl(commit.id, 'schematic_pdf') : null
	};
};

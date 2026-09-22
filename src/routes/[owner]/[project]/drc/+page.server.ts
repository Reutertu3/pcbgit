import type { PageServerLoad } from './$types';
import { all } from '$lib/server/db';
import { firstArtifactUrl } from '$lib/server/projectcontext';
import type { ViolationRow } from '$lib/types';

export const load: PageServerLoad = async ({ parent }) => {
	const { commit } = await parent();
	if (!commit) return { violations: [], reports: { drc: null, erc: null } };

	return {
		violations: all<ViolationRow>(
			`SELECT id, source, severity, rule, message, detail, x_mm, y_mm, layer
			 FROM drc_violations WHERE commit_id = ? ORDER BY ordinal`,
			commit.id
		),
		reports: {
			drc: firstArtifactUrl(commit.id, 'drc_json'),
			erc: firstArtifactUrl(commit.id, 'erc_json')
		}
	};
};

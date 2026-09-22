import type { PageServerLoad } from './$types';
import { all } from '$lib/server/db';
import { boardLayers } from '$lib/server/projectcontext';
import type { ViolationRow } from '$lib/types';

export const load: PageServerLoad = async ({ parent }) => {
	const { commit } = await parent();
	if (!commit) return { layers: [], markers: [] };

	return {
		layers: boardLayers(commit.id),
		// Only located board-side violations can be drawn on the layout.
		markers: all<ViolationRow>(
			`SELECT id, source, severity, rule, message, detail, x_mm, y_mm, layer
			 FROM drc_violations
			 WHERE commit_id = ? AND source != 'erc' AND x_mm IS NOT NULL AND severity IN ('error','warning')
			 ORDER BY severity, ordinal LIMIT 500`,
			commit.id
		)
	};
};

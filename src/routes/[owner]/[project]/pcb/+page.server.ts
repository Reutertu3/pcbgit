import type { PageServerLoad } from './$types';
import { all, get } from '$lib/server/db';
import { boardLayers } from '$lib/server/projectcontext';
import type { ViolationRow } from '$lib/types';

export const load: PageServerLoad = async ({ parent, url }) => {
	const { commit } = await parent();
	if (!commit) return { layers: [], markers: [], focus: null };

	// "Show on the board" from the Checks tab: this violation is zoomed to.
	const focusId = url.searchParams.get('marker');
	const focus = focusId
		? (get<ViolationRow>(
				`SELECT id, source, severity, rule, message, detail, x_mm, y_mm, layer
				 FROM drc_violations WHERE commit_id = ? AND id = ? AND x_mm IS NOT NULL`,
				commit.id,
				focusId
			) ?? null)
		: null;

	return {
		layers: boardLayers(commit.id),
		focus,
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

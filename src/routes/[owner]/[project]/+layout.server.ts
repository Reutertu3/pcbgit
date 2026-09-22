import type { LayoutServerLoad } from './$types';
import { count } from '$lib/server/db';
import { loadProjectContext } from '$lib/server/projectcontext';
import { artifactSummary } from '$lib/server/projectcontext';

export const load: LayoutServerLoad = async ({ params, locals, url }) => {
	const context = loadProjectContext(
		params.owner,
		params.project,
		locals.user,
		url.searchParams.get('v')
	);

	const commitId = context.commit?.id;
	const artifacts = commitId
		? artifactSummary(commitId)
		: { hasSchematic: false, hasPcb: false, has3d: false, hasFab: false, totalBytes: 0 };

	return {
		project: context.project,
		commit: context.commit,
		versions: context.versions,
		editable: context.editable,
		starred: context.starred,
		isHead: context.isHead,
		tabs: {
			schematic: artifacts.hasSchematic,
			pcb: artifacts.hasPcb,
			three: artifacts.has3d,
			bom: commitId ? count('SELECT COUNT(*) FROM bom_items WHERE commit_id = ?', commitId) : 0,
			drc: commitId ? count('SELECT COUNT(*) FROM drc_violations WHERE commit_id = ?', commitId) : 0
		}
	};
};

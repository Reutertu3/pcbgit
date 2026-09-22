import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { all } from '$lib/server/db';
import { loadProjectContext } from '$lib/server/projectcontext';
import { bomToCsv } from '$lib/server/render/bom';
import type { BomRow } from '$lib/types';

export const GET: RequestHandler = async ({ params, locals, url }) => {
	const { project, commit } = loadProjectContext(
		params.owner,
		params.project,
		locals.user,
		url.searchParams.get('v')
	);
	if (!commit) error(404, 'No version to export');

	const rows = all<BomRow>(
		'SELECT refs, value, footprint, quantity, datasheet, description, mpn, dnp FROM bom_items WHERE commit_id = ? ORDER BY ordinal',
		commit.id
	);
	if (!rows.length) error(404, 'This version has no bill of materials');

	const csv = bomToCsv(rows.map((row) => ({ ...row, dnp: Boolean(row.dnp) })));
	return new Response(csv, {
		headers: {
			'Content-Type': 'text/csv; charset=utf-8',
			'Content-Disposition': `attachment; filename="${project.slug}-bom-${commit.sha.slice(0, 7)}.csv"`
		}
	});
};

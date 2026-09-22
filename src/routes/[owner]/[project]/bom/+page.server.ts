import type { PageServerLoad } from './$types';
import { all, get } from '$lib/server/db';
import type { BomRow } from '$lib/types';

export interface BomDiffRow extends BomRow {
	change: 'added' | 'removed' | 'changed' | 'same';
	previousQuantity?: number;
}

export const load: PageServerLoad = async ({ parent, url }) => {
	const { commit, project } = await parent();
	if (!commit) return { rows: [], compare: null, compareOptions: [] };

	const rows = all<BomRow>(
		`SELECT id, refs, value, footprint, quantity, datasheet, description, mpn, dnp
		 FROM bom_items WHERE commit_id = ? ORDER BY ordinal`,
		commit.id
	);

	const compareOptions = all<{ id: string; sha: string; message: string; committed_at: number }>(
		`SELECT id, sha, message, committed_at FROM commits
		 WHERE project_id = ? AND id != ? AND EXISTS (SELECT 1 FROM bom_items b WHERE b.commit_id = commits.id)
		 ORDER BY committed_at DESC, rowid DESC LIMIT 30`,
		project.id
	);

	const compareSha = url.searchParams.get('compare');
	if (!compareSha) return { rows, compare: null, compareOptions };

	const other = get<{ id: string; sha: string }>(
		'SELECT id, sha FROM commits WHERE project_id = ? AND (sha = ? OR id = ?)',
		project.id,
		compareSha,
		compareSha
	);
	if (!other) return { rows, compare: null, compareOptions };

	const previous = all<BomRow>(
		'SELECT id, refs, value, footprint, quantity, datasheet, description, mpn, dnp FROM bom_items WHERE commit_id = ? ORDER BY ordinal',
		other.id
	);

	return { rows, compare: { sha: other.sha, diff: diffBom(previous, rows) }, compareOptions };
};

/** Lines are matched on value + footprint, which is how they were grouped. */
function diffBom(previous: BomRow[], current: BomRow[]): BomDiffRow[] {
	const key = (row: BomRow) => `${row.value}\u001f${row.footprint}\u001f${row.mpn}`;
	const before = new Map(previous.map((row) => [key(row), row]));
	const out: BomDiffRow[] = [];

	for (const row of current) {
		const match = before.get(key(row));
		if (!match) {
			out.push({ ...row, change: 'added' });
		} else if (match.quantity !== row.quantity || match.refs !== row.refs) {
			out.push({ ...row, change: 'changed', previousQuantity: match.quantity });
		} else {
			out.push({ ...row, change: 'same' });
		}
		before.delete(key(row));
	}

	// Anything left in `before` was dropped between the two versions.
	for (const row of before.values()) out.push({ ...row, change: 'removed' });
	return out;
}

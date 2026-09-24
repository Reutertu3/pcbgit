import { error } from '@sveltejs/kit';
import { all, get } from './db';
import { artifactMeta, listArtifacts, type ArtifactRow } from './render/artifacts';
import { canEdit, canView, getProject, isStarred, type ProjectCard } from './projects';
import type { CommitSummary, LayerArtifact, SheetArtifact } from '$lib/types';
import type { User } from './auth';
import { FAB_PROFILES } from '$lib/fab';

export interface ProjectContext {
	project: ProjectCard;
	commit: CommitSummary | null;
	/** Commits offered in the version switcher. */
	versions: Pick<CommitSummary, 'id' | 'sha' | 'message' | 'committed_at' | 'render_status'>[];
	editable: boolean;
	starred: boolean;
	isHead: boolean;
}

/**
 * Resolves the project and the commit being viewed. `?v=<sha>` pins a version;
 * without it every tab shows the head of the default branch.
 */
export function loadProjectContext(
	owner: string,
	slug: string,
	viewer: User | null,
	versionParam: string | null
): ProjectContext {
	const project = getProject(owner, slug);
	if (!project || !canView(project, viewer)) error(404, 'error.boardNotFound');

	const versions = all<ProjectContext['versions'][number]>(
		`SELECT id, sha, message, committed_at, render_status FROM commits
		 WHERE project_id = ? ORDER BY committed_at DESC, rowid DESC LIMIT 50`,
		project.id
	);

	let commit: CommitSummary | null = null;
	if (versionParam) {
		commit =
			get<CommitSummary>(
				'SELECT * FROM commits WHERE project_id = ? AND (sha = ? OR id = ?)',
				project.id,
				versionParam,
				versionParam
			) ??
			get<CommitSummary>(
				'SELECT * FROM commits WHERE project_id = ? AND sha LIKE ?',
				project.id,
				`${versionParam}%`
			) ??
			null;
		if (!commit) error(404, 'error.versionNotFound');
	} else if (project.head_commit_id) {
		commit = get<CommitSummary>('SELECT * FROM commits WHERE id = ?', project.head_commit_id) ?? null;
	}

	return {
		project,
		commit,
		versions,
		editable: canEdit(project, viewer),
		starred: isStarred(viewer?.id, project.id),
		isHead: Boolean(commit && commit.id === project.head_commit_id)
	};
}

function artifactUrl(row: ArtifactRow) {
	// rel_path is "<commitId>/<file>", which is exactly the artifact route shape.
	return `/artifacts/${row.rel_path.replace(/\\/g, '/')}`;
}

export function schematicSheets(commitId: string): SheetArtifact[] {
	return listArtifacts(commitId, 'schematic_svg').map((row) => {
		const meta = artifactMeta<{ geometry?: { viewBox: string | null } }>(row);
		return { id: row.id, name: row.name, url: artifactUrl(row), viewBox: meta.geometry?.viewBox ?? null };
	});
}

export function boardLayers(commitId: string): LayerArtifact[] {
	return listArtifacts(commitId, 'pcb_layer_svg').map((row) => {
		const meta = artifactMeta<{
			geometry?: { viewBox: string | null };
			style?: LayerArtifact['style'];
		}>(row);
		return {
			id: row.id,
			name: row.name,
			url: artifactUrl(row),
			viewBox: meta.geometry?.viewBox ?? null,
			style: meta.style ?? {
				id: row.name,
				label: row.name,
				group: 'fabrication',
				side: 'both',
				color: '#8a8f98',
				defaultOn: true,
				order: 100
			}
		};
	});
}

export function firstArtifactUrl(commitId: string, kind: Parameters<typeof listArtifacts>[1]) {
	const [row] = listArtifacts(commitId, kind);
	return row ? artifactUrl(row) : null;
}

/** Board houses in the order $lib/fab lists them; unknown names (older renders) last. */
function fabOrder(profile: string) {
	const index = FAB_PROFILES.findIndex((p) => p.id === profile);
	return index === -1 ? FAB_PROFILES.length : index;
}

export function artifactSummary(commitId: string) {
	const rows = listArtifacts(commitId);
	return {
		hasSchematic: rows.some((row) => row.kind === 'schematic_svg'),
		hasPcb: rows.some((row) => row.kind === 'pcb_layer_svg'),
		has3d: rows.some((row) => row.kind === 'pcb_glb'),
		hasFab: rows.some((row) => row.kind === 'fab_zip'),
		// One per board house ($lib/fab); renders before profiles have a single "fabrication.zip".
		fabZips: rows
			.filter((row) => row.kind === 'fab_zip')
			.map((row) => ({ profile: row.name, url: artifactUrl(row) }))
			.sort((a, b) => fabOrder(a.profile) - fabOrder(b.profile)),
		ibom: rows.find((row) => row.kind === 'ibom_html'),
		schematicPdf: rows.find((row) => row.kind === 'schematic_pdf'),
		convertedProject: rows.find((row) => row.kind === 'converted_zip'),
		previewFront: rows.find((row) => row.kind === 'pcb_preview_svg' && row.name === 'front'),
		previewBack: rows.find((row) => row.kind === 'pcb_preview_svg' && row.name === 'back'),
		totalBytes: rows.reduce((sum, row) => sum + row.size_bytes, 0),
		rows
	};
}

export { artifactUrl };

/** Types shared between the server and the browser. Kept out of $lib/server so
 *  Svelte components can import them without dragging server code along. */

export interface TagRef {
	slug: string;
	name: string;
	color: string;
	category: string;
}

export interface ProjectSummary {
	id: string;
	owner_id: string;
	slug: string;
	name: string;
	description: string;
	visibility: 'public' | 'private';
	license: string;
	source_url: string;
	default_branch: string;
	head_commit_id: string | null;
	created_at: number;
	updated_at: number;
	owner_username: string;
	owner_display_name: string;
	star_count: number;
	comment_count: number;
	commit_count: number;
	tags: TagRef[];
	head_sha: string | null;
	head_status: string | null;
	board_width: number | null;
	board_height: number | null;
	layer_count: number | null;
	part_count: number | null;
	drc_errors: number;
	has_schematic: number;
	has_pcb: number;
	has_bom: number;
}

export interface CommitSummary {
	id: string;
	project_id: string;
	sha: string;
	branch: string;
	message: string;
	author_name: string;
	author_email: string;
	committed_at: number;
	created_at: number;
	render_status: 'queued' | 'running' | 'success' | 'failed' | 'skipped';
	board_name: string;
	board_width: number | null;
	board_height: number | null;
	layer_count: number | null;
	net_count: number | null;
	part_count: number | null;
	drc_errors: number;
	drc_warnings: number;
	erc_errors: number;
	erc_warnings: number;
	/** JSON {minX,minY,maxX,maxY} in mm, or '' when there is no board. */
	board_bbox: string;
}

export interface BomRow {
	id: string;
	refs: string;
	value: string;
	footprint: string;
	quantity: number;
	datasheet: string;
	description: string;
	mpn: string;
	dnp: number;
}

export interface ViolationRow {
	id: string;
	source: 'drc' | 'erc' | 'unconnected' | 'schematic_parity';
	severity: 'error' | 'warning' | 'info' | 'exclusion';
	rule: string;
	message: string;
	detail: string;
	x_mm: number | null;
	y_mm: number | null;
	layer: string;
}

export interface LayerArtifact {
	id: string;
	name: string;
	url: string;
	viewBox: string | null;
	style: {
		id: string;
		label: string;
		group: string;
		side: string;
		color: string;
		defaultOn: boolean;
		order: number;
	};
}

export interface SheetArtifact {
	id: string;
	name: string;
	url: string;
	viewBox: string | null;
}

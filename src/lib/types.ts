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
	/** Version of the owner's profile picture; null without one. */
	owner_avatar: number | null;
	/** Head version's source: '' for a native KiCad project, e.g. 'Eagle 6.1' when converted. */
	converted_from: string;
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
	/** When the head version's artifacts were stored; versions the thumbnail URLs. */
	head_rendered_at: number | null;
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
	/** '' for a native KiCad project; e.g. 'Eagle 6.1' when converted on render. */
	converted_from: string;
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

/** Pending pcbgit update, as recorded on the host by deploy/update.sh --check. */
export interface ChangelogEntry {
	sha: string;
	short: string;
	author: string;
	date: number;
	subject: string;
	url: string | null;
}

export interface Availability {
	checked: number;
	ok: boolean;
	branch: string;
	current: string;
	latest: string;
	/** Commits on GitHub the server does not have yet. */
	behind: number;
	/** Commits only on the server; they block a fast-forward update. */
	ahead: number;
	repoUrl: string | null;
	commits: ChangelogEntry[];
	checkRequested: boolean;
	/** Registry updates pull from; null when this server builds each version itself. */
	source: string | null;
	/** Whether the newest commit's image can be pulled (update.sh `image_state`); null when up to date. */
	image: ImageState | null;
}

/** update.sh's status file. */
export type UpdateStep = 'fetch' | 'wait' | 'pull' | 'build' | 'restart' | 'done';

export interface UpdateStatus {
	state: 'running' | 'success' | 'failed';
	/** Absent in status files from before steps were recorded. */
	step?: UpdateStep;
	/** How the new version got onto the server, once decided. */
	how?: 'pulled' | 'built' | '';
	trigger?: 'manual' | 'auto';
	message: string;
	started: number;
	finished: number | null;
	from: string;
	to: string;
	/** Short commit the update is going to. */
	target?: string;
}

export type ImageState = 'ready' | 'building' | 'failed' | 'missing' | 'unreadable' | 'local' | 'off';

export interface CommentView {
	id: string;
	body: string;
	created_at: number;
	/** A deleted comment kept as a placeholder because it has replies. */
	deleted: boolean;
	user_id: string;
	username: string;
	display_name: string;
	avatar: number | null;
}

export interface CommentThread extends CommentView {
	replies: CommentView[];
}

export interface NotificationView {
	id: string;
	kind: 'comment' | 'reply' | 'version';
	created_at: number;
	read_at: number | null;
	comment_id: string | null;
	/** Versions a push or upload brought (kind 'version'). */
	version_count: number;
	actor: string;
	project_name: string;
	project_slug: string;
	project_owner: string;
	/** Comment text, or the newest version's commit message. */
	excerpt: string | null;
	short_sha: string | null;
}

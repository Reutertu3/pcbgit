import { all, audit, count, get, newId, now, run, tx } from './db';
import { deleteRepo, initRepo, listCommits, repoExists, resolveRef } from './git';
import { repoPath } from './paths';
import { enqueueRender } from './render/worker';
import type { User } from './auth';
import type { CommitSummary, ProjectSummary, TagRef } from '$lib/types';

export interface Project {
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
}

/** A project row enriched with the counts and render facts the UI shows. */
export type ProjectCard = ProjectSummary;

export const LICENSES = [
	'CERN-OHL-S-2.0',
	'CERN-OHL-W-2.0',
	'CERN-OHL-P-2.0',
	'TAPR-OHL-1.0',
	'MIT',
	'Apache-2.0',
	'BSD-3-Clause',
	'GPL-3.0',
	'CC-BY-4.0',
	'CC-BY-SA-4.0',
	'CC0-1.0',
	'Proprietary'
];

export function slugify(value: string) {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9._-]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.replace(/-{2,}/g, '-')
		.slice(0, 64);
}

export function validateSlug(slug: string) {
	if (!/^[a-z0-9][a-z0-9._-]{0,62}[a-z0-9]$/i.test(slug)) {
		return 'validation.slug' as const;
	}
	return null;
}

/* ------------------------------------------------------------- queries */

const CARD_SELECT = `
	SELECT p.*,
	  u.username AS owner_username,
	  u.display_name AS owner_display_name,
	  (SELECT COUNT(*) FROM stars s WHERE s.project_id = p.id) AS star_count,
	  (SELECT COUNT(*) FROM comments c WHERE c.project_id = p.id AND c.deleted_at IS NULL) AS comment_count,
	  (SELECT COUNT(*) FROM commits c WHERE c.project_id = p.id) AS commit_count,
	  hc.sha AS head_sha,
	  hc.render_status AS head_status,
	  hc.board_width, hc.board_height, hc.layer_count, hc.part_count,
	  COALESCE(hc.drc_errors, 0) AS drc_errors,
	  EXISTS (SELECT 1 FROM artifacts a WHERE a.commit_id = p.head_commit_id AND a.kind = 'schematic_svg') AS has_schematic,
	  EXISTS (SELECT 1 FROM artifacts a WHERE a.commit_id = p.head_commit_id AND a.kind = 'pcb_layer_svg') AS has_pcb,
	  EXISTS (SELECT 1 FROM bom_items b WHERE b.commit_id = p.head_commit_id) AS has_bom
	FROM projects p
	JOIN users u ON u.id = p.owner_id
	LEFT JOIN commits hc ON hc.id = p.head_commit_id`;

export interface BrowseQuery {
	viewer?: User | null;
	search?: string;
	tags?: string[];
	owner?: string;
	license?: string;
	sort?: 'recent' | 'stars' | 'name' | 'created';
	starredBy?: string;
	page?: number;
	perPage?: number;
}

export function browseProjects(query: BrowseQuery) {
	const perPage = Math.min(Math.max(query.perPage ?? 24, 1), 100);
	const page = Math.max(query.page ?? 1, 1);

	const where: string[] = [];
	const params: unknown[] = [];

	// Private projects are visible to their owner and to admins only.
	if (query.viewer?.role === 'admin') {
		where.push('1 = 1');
	} else if (query.viewer) {
		where.push("(p.visibility = 'public' OR p.owner_id = ?)");
		params.push(query.viewer.id);
	} else {
		where.push("p.visibility = 'public'");
	}

	if (query.search?.trim()) {
		const term = `%${query.search.trim()}%`;
		where.push('(p.name LIKE ? OR p.slug LIKE ? OR p.description LIKE ? OR u.username LIKE ?)');
		params.push(term, term, term, term);
	}
	if (query.owner) {
		where.push('u.username = ?');
		params.push(query.owner);
	}
	if (query.license) {
		where.push('p.license = ?');
		params.push(query.license);
	}
	if (query.starredBy) {
		where.push('EXISTS (SELECT 1 FROM stars s WHERE s.project_id = p.id AND s.user_id = ?)');
		params.push(query.starredBy);
	}
	for (const tag of query.tags ?? []) {
		where.push(
			'EXISTS (SELECT 1 FROM project_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.project_id = p.id AND t.slug = ?)'
		);
		params.push(tag);
	}

	const whereSql = `WHERE ${where.join(' AND ')}`;
	const orderSql = {
		recent: 'p.updated_at DESC',
		created: 'p.created_at DESC',
		stars: 'star_count DESC, p.updated_at DESC',
		name: 'p.name COLLATE NOCASE ASC'
	}[query.sort ?? 'recent'];

	const total = count(
		`SELECT COUNT(*) FROM projects p JOIN users u ON u.id = p.owner_id ${whereSql}`,
		...params
	);
	const rows = all<ProjectCard>(
		`${CARD_SELECT} ${whereSql} ORDER BY ${orderSql} LIMIT ? OFFSET ?`,
		...params,
		perPage,
		(page - 1) * perPage
	);

	return {
		projects: rows.map(withTags),
		total,
		page,
		perPage,
		pageCount: Math.max(1, Math.ceil(total / perPage))
	};
}

function withTags(project: ProjectCard): ProjectCard {
	project.tags = all<TagRef>(
		`SELECT t.slug, t.name, t.color, t.category FROM project_tags pt
		 JOIN tags t ON t.id = pt.tag_id WHERE pt.project_id = ? ORDER BY t.category, t.name`,
		project.id
	);
	return project;
}

export function getProject(ownerUsername: string, slug: string) {
	const row = get<ProjectCard>(`${CARD_SELECT} WHERE u.username = ? AND p.slug = ?`, ownerUsername, slug);
	return row ? withTags(row) : null;
}

export function getProjectById(id: string) {
	const row = get<ProjectCard>(`${CARD_SELECT} WHERE p.id = ?`, id);
	return row ? withTags(row) : null;
}

export function canView(project: Pick<Project, 'visibility' | 'owner_id'>, viewer: User | null) {
	return project.visibility === 'public' || viewer?.id === project.owner_id || viewer?.role === 'admin';
}

export function canEdit(project: Pick<Project, 'owner_id'>, viewer: User | null) {
	return Boolean(viewer) && (viewer!.id === project.owner_id || viewer!.role === 'admin');
}

/* ------------------------------------------------------------ mutations */

export async function createProject(opts: {
	owner: User;
	slug: string;
	name: string;
	description?: string;
	visibility?: 'public' | 'private';
	license?: string;
	sourceUrl?: string;
	tags?: string[];
}) {
	const id = newId();
	const ts = now();
	run(
		`INSERT INTO projects (id, owner_id, slug, name, description, visibility, license, source_url, created_at, updated_at)
		 VALUES (?,?,?,?,?,?,?,?,?,?)`,
		id,
		opts.owner.id,
		opts.slug,
		opts.name,
		opts.description ?? '',
		opts.visibility ?? 'public',
		opts.license ?? '',
		opts.sourceUrl ?? '',
		ts,
		ts
	);
	if (opts.tags?.length) setProjectTags(id, opts.tags);
	await initRepo(opts.owner.username, opts.slug);
	audit(opts.owner.id, 'project.create', `${opts.owner.username}/${opts.slug}`);
	return getProjectById(id)!;
}

export async function deleteProject(project: ProjectCard, actorId: string) {
	run('DELETE FROM projects WHERE id = ?', project.id);
	await deleteRepo(project.owner_username, project.slug);
	audit(actorId, 'project.delete', `${project.owner_username}/${project.slug}`);
}

export function updateProject(
	id: string,
	patch: Partial<Pick<Project, 'name' | 'description' | 'visibility' | 'license' | 'source_url' | 'default_branch'>>
) {
	const fields = Object.keys(patch) as (keyof typeof patch)[];
	if (!fields.length) return;
	run(
		`UPDATE projects SET ${fields.map((f) => `${f} = ?`).join(', ')}, updated_at = ? WHERE id = ?`,
		...fields.map((f) => patch[f]),
		now(),
		id
	);
}

/**
 * Reconciles the commit table with what is actually in the repo and queues
 * renders for anything new. Called after every push and every web upload.
 */
export async function syncCommits(project: { id: string; slug: string; default_branch: string }, ownerUsername: string) {
	const repo = repoPath(ownerUsername, project.slug);
	if (!repoExists(ownerUsername, project.slug)) return { added: 0, head: null };

	const branch = (await resolveRef(repo, project.default_branch)) ? project.default_branch : 'HEAD';
	const commits = await listCommits(repo, branch, 200);
	if (!commits.length) return { added: 0, head: null };

	const known = new Set(
		all<{ sha: string }>('SELECT sha FROM commits WHERE project_id = ?', project.id).map((r) => r.sha)
	);

	const added: { id: string; sha: string }[] = [];
	tx(() => {
		// Insert oldest first so rowid rises with history; git timestamps have only
		// second resolution, so rowid is the tiebreaker every ordering relies on.
		for (const commit of [...commits].reverse()) {
			if (known.has(commit.sha)) continue;
			const id = newId();
			run(
				`INSERT INTO commits (id, project_id, sha, branch, message, author_name, author_email, committed_at, created_at)
				 VALUES (?,?,?,?,?,?,?,?,?)`,
				id,
				project.id,
				commit.sha,
				project.default_branch,
				commit.message,
				commit.authorName,
				commit.authorEmail,
				commit.committedAt,
				now()
			);
			added.push({ id, sha: commit.sha });
		}
	});

	const headSha = commits[0].sha;
	const head = get<{ id: string }>('SELECT id FROM commits WHERE project_id = ? AND sha = ?', project.id, headSha);
	if (head) {
		run('UPDATE projects SET head_commit_id = ?, updated_at = ? WHERE id = ?', head.id, now(), project.id);
	}

	// Render newest first so the page a user lands on fills in first.
	for (const commit of [...added].reverse()) enqueueRender(project.id, commit.id);
	return { added: added.length, head: head?.id ?? null };
}

export interface CommitListRow extends CommitSummary {
	bom_count: number;
	job_status: string | null;
}

export function listProjectCommits(projectId: string, limit = 100) {
	return all<CommitListRow>(
		`SELECT c.*,
		   (SELECT COUNT(*) FROM bom_items b WHERE b.commit_id = c.id) AS bom_count,
		   (SELECT status FROM render_jobs j WHERE j.commit_id = c.id ORDER BY j.queued_at DESC LIMIT 1) AS job_status
		 FROM commits c WHERE c.project_id = ? ORDER BY c.committed_at DESC, c.rowid DESC LIMIT ?`,
		projectId,
		limit
	);
}

/* ----------------------------------------------------------------- tags */

export interface Tag {
	id: string;
	slug: string;
	name: string;
	category: string;
	color: string;
	description: string;
	created_at: number;
	project_count: number;
}

export function listTags() {
	return all<Tag>(
		`SELECT t.*,
		   (SELECT COUNT(*) FROM project_tags pt
		      JOIN projects p ON p.id = pt.project_id
		    WHERE pt.tag_id = t.id AND p.visibility = 'public') AS project_count
		 FROM tags t
		 ORDER BY t.category, t.name`
	);
}

/** Tags actually in use, most popular first — what the browse sidebar shows. */
export function popularTags(limit = 40) {
	return listTags()
		.filter((tag) => tag.project_count > 0)
		.sort((a, b) => b.project_count - a.project_count || a.name.localeCompare(b.name))
		.slice(0, limit);
}

/** Colour a tag gets when none is chosen; also used to backfill old rows. */
export const CATEGORY_COLORS: Record<string, string> = {
	component: '#6ba4e8',
	interface: '#9cb080',
	domain: '#e2b862',
	process: '#c4829a',
	general: '#8a9a8b'
};

export function isTagColor(value: string) {
	return /^#[0-9a-f]{6}$/i.test(value);
}

/** Creates a tag if it does not exist. Admin and bootstrap only; users never create tags. */
export function ensureTag(name: string, category = 'general', color?: string) {
	const slug = slugify(name);
	if (!slug) return null;
	const existing = get<{ id: string }>('SELECT id FROM tags WHERE slug = ?', slug);
	if (existing) return existing.id;
	const id = newId();
	run(
		'INSERT INTO tags (id, slug, name, category, color, created_at) VALUES (?,?,?,?,?,?)',
		id,
		slug,
		name.trim().slice(0, 40),
		category,
		color && isTagColor(color) ? color : (CATEGORY_COLORS[category] ?? CATEGORY_COLORS.general),
		now()
	);
	return id;
}

/**
 * Replaces a board's tags. Only existing tags are accepted (matched by slug or
 * name); anything else is ignored, so a crafted request cannot create tags.
 */
export function setProjectTags(projectId: string, tagSlugsOrNames: string[]) {
	tx(() => {
		run('DELETE FROM project_tags WHERE project_id = ?', projectId);
		const seen = new Set<string>();
		for (const raw of tagSlugsOrNames.slice(0, 20)) {
			const value = raw.trim();
			if (!value) continue;
			const tag = get<{ id: string }>(
				'SELECT id FROM tags WHERE slug = ? OR name = ? COLLATE NOCASE',
				slugify(value),
				value
			);
			if (!tag || seen.has(tag.id)) continue;
			seen.add(tag.id);
			run('INSERT INTO project_tags (project_id, tag_id) VALUES (?, ?)', projectId, tag.id);
		}
	});
}

/* ---------------------------------------------------------------- stars */

export function toggleStar(userId: string, projectId: string) {
	const existing = get('SELECT 1 AS x FROM stars WHERE user_id = ? AND project_id = ?', userId, projectId);
	if (existing) {
		run('DELETE FROM stars WHERE user_id = ? AND project_id = ?', userId, projectId);
		return false;
	}
	run('INSERT INTO stars (user_id, project_id, created_at) VALUES (?,?,?)', userId, projectId, now());
	return true;
}

export function isStarred(userId: string | undefined, projectId: string) {
	if (!userId) return false;
	return Boolean(get('SELECT 1 AS x FROM stars WHERE user_id = ? AND project_id = ?', userId, projectId));
}

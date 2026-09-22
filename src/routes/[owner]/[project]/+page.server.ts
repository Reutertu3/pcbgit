import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { all, newId, now, run } from '$lib/server/db';
import { listTree, readBlob } from '$lib/server/git';
import { renderMarkdown } from '$lib/server/markdown';
import { repoPath } from '$lib/server/paths';
import { artifactSummary, artifactUrl, loadProjectContext } from '$lib/server/projectcontext';
import { canView, getProject } from '$lib/server/projects';

const README = /^readme(\.(md|markdown|txt))?$/i;

interface RecentCommit {
	id: string;
	sha: string;
	message: string;
	author_name: string;
	committed_at: number;
	render_status: string;
}

interface CommentRow {
	id: string;
	body: string;
	created_at: number;
	username: string;
	display_name: string;
}

export const load: PageServerLoad = async ({ params, locals, url, parent }) => {
	const { project, commit } = await parent();

	let readme: { name: string; html: string } | null = null;
	let fileCount = 0;

	if (commit) {
		const repo = repoPath(project.owner_username, project.slug);
		try {
			const tree = await listTree(repo, commit.sha);
			fileCount = tree.length;
			// Only a top-level README is shown, the way a repository host does it.
			const entry = tree.find((file) => !file.path.includes('/') && README.test(file.path));
			if (entry && entry.size < 512 * 1024) {
				const source = await readBlob(repo, commit.sha, entry.path);
				readme = { name: entry.path, html: renderMarkdown(source) };
			}
		} catch {
			// A repository with no commits yet; the empty state covers it.
		}
	}

	const artifacts = commit ? artifactSummary(commit.id) : null;

	return {
		readme,
		fileCount,
		previews: {
			front: artifacts?.previewFront ? artifactUrl(artifacts.previewFront) : null,
			back: artifacts?.previewBack ? artifactUrl(artifacts.previewBack) : null
		},
		hasFab: artifacts?.hasFab ?? false,
		artifactBytes: artifacts?.totalBytes ?? 0,
		recentCommits: all<RecentCommit>(
			`SELECT id, sha, message, author_name, committed_at, render_status
			 FROM commits WHERE project_id = ? ORDER BY committed_at DESC, rowid DESC LIMIT 5`,
			project.id
		),
		comments: all<CommentRow>(
			`SELECT c.id, c.body, c.created_at, u.username, u.display_name
			 FROM comments c JOIN users u ON u.id = c.user_id
			 WHERE c.project_id = ? ORDER BY c.created_at ASC LIMIT 200`,
			project.id
		),
		cloneUrl: `${url.origin}/git/${project.owner_username}/${project.slug}.git`
	};
};

export const actions: Actions = {
	comment: async ({ request, params, locals }) => {
		if (!locals.user) return fail(401, { error: 'Sign in to comment.' });

		const project = getProject(params.owner, params.project);
		if (!project || !canView(project, locals.user)) error(404, 'Board not found');

		const body = String((await request.formData()).get('body') ?? '').trim();
		if (!body) return fail(400, { error: 'Write something first.' });
		if (body.length > 4000) return fail(400, { error: 'Comment is too long (4000 characters max).' });

		run(
			'INSERT INTO comments (id, project_id, user_id, body, created_at) VALUES (?,?,?,?,?)',
			newId(),
			project.id,
			locals.user.id,
			body,
			now()
		);
		return { success: true };
	},

	deleteComment: async ({ request, params, locals }) => {
		if (!locals.user) return fail(401, { error: 'Sign in first.' });
		const project = getProject(params.owner, params.project);
		if (!project) error(404, 'Board not found');

		const id = String((await request.formData()).get('id') ?? '');
		// Comment authors, the board owner and admins can remove a comment.
		const canModerate = locals.user.role === 'admin' || locals.user.id === project.owner_id;
		run(
			canModerate
				? 'DELETE FROM comments WHERE id = ? AND project_id = ?'
				: 'DELETE FROM comments WHERE id = ? AND project_id = ? AND user_id = ?',
			...(canModerate ? [id, project.id] : [id, project.id, locals.user.id])
		);
		return { success: true };
	}
};

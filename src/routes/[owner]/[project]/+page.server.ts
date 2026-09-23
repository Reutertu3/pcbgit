import { error, fail } from '@sveltejs/kit';
import { translate } from '$lib/i18n';
import type { Actions, PageServerLoad } from './$types';
import { all } from '$lib/server/db';
import { listTree, readBlob } from '$lib/server/git';
import { renderMarkdown } from '$lib/server/markdown';
import { repoPath } from '$lib/server/paths';
import { artifactSummary, artifactUrl, loadProjectContext } from '$lib/server/projectcontext';
import { canView, getProject } from '$lib/server/projects';
import { CommentError, addComment, countComments, listThreads, removeComment } from '$lib/server/comments';

const README = /^readme(\.(md|markdown|txt))?$/i;

interface RecentCommit {
	id: string;
	sha: string;
	message: string;
	author_name: string;
	committed_at: number;
	render_status: string;
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
		fabZips: artifacts?.fabZips ?? [],
		artifactBytes: artifacts?.totalBytes ?? 0,
		recentCommits: all<RecentCommit>(
			`SELECT id, sha, message, author_name, committed_at, render_status
			 FROM commits WHERE project_id = ? ORDER BY committed_at DESC, rowid DESC LIMIT 5`,
			project.id
		),
		threads: listThreads(project.id),
		commentCount: countComments(project.id),
		cloneUrl: `${url.origin}/git/${project.owner_username}/${project.slug}.git`
	};
};

export const actions: Actions = {
	comment: async ({ request, params, locals }) => {
		if (!locals.user) return fail(401, { error: translate(locals.locale, 'comments.error.signIn'), parentId: '' });

		const project = getProject(params.owner, params.project);
		if (!project || !canView(project, locals.user)) error(404, 'error.boardNotFound');

		const form = await request.formData();
		const parentId = String(form.get('parent_id') ?? '') || null;
		try {
			const { id } = addComment(project.id, locals.user.id, String(form.get('body') ?? ''), parentId);
			return { success: true, commentId: id };
		} catch (thrown) {
			if (thrown instanceof CommentError) return fail(400, { error: thrown.in(locals.locale), parentId: parentId ?? '' });
			throw thrown;
		}
	},

	deleteComment: async ({ request, params, locals }) => {
		if (!locals.user) return fail(401, { error: translate(locals.locale, 'error.signInFirst'), parentId: '' });
		const project = getProject(params.owner, params.project);
		if (!project) error(404, 'error.boardNotFound');

		const id = String((await request.formData()).get('id') ?? '');
		try {
			removeComment(project.id, id, locals.user);
			return { success: true };
		} catch (thrown) {
			if (thrown instanceof CommentError) return fail(403, { error: thrown.in(locals.locale), parentId: '' });
			throw thrown;
		}
	}
};

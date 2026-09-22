import type { RequestHandler } from './$types';
import { authenticateToken, getUserByUsername } from '$lib/server/auth';
import { get } from '$lib/server/db';
import { authRequired, parseBasicAuth, runGitBackend } from '$lib/server/githttp';
import { repoPath } from '$lib/server/paths';
import { syncCommits } from '$lib/server/projects';
import { repoExists } from '$lib/server/git';

interface Target {
	id: string;
	slug: string;
	default_branch: string;
	visibility: 'public' | 'private';
	owner_id: string;
	owner_username: string;
}

/** Push requests are the ones that need write access. */
function isWrite(pathInfo: string, queryString: string) {
	return pathInfo.endsWith('/git-receive-pack') || queryString.includes('service=git-receive-pack');
}

async function handle(event: Parameters<RequestHandler>[0]) {
	const { params, request, url } = event;
	// Clients clone ".../project.git"; the suffix is cosmetic on our side.
	const slug = params.project.replace(/\.git$/, '');
	const pathInfo = params.path ? `/${params.path}` : '/';
	const queryString = url.search.replace(/^\?/, '');

	const project = get<Target>(
		`SELECT p.id, p.slug, p.default_branch, p.visibility, p.owner_id, u.username AS owner_username
		 FROM projects p JOIN users u ON u.id = p.owner_id
		 WHERE u.username = ? AND p.slug = ?`,
		params.owner,
		slug
	);
	if (!project) return new Response('Repository not found\n', { status: 404 });

	const write = isWrite(pathInfo, queryString);
	const credentials = parseBasicAuth(request.headers.get('authorization'));

	// Session cookies do not apply here: git only speaks basic auth.
	const actor = credentials
		? authenticateToken(credentials.username, credentials.password)
		: null;

	if (credentials && !actor) {
		return new Response('Invalid username or access token\n', { status: 403 });
	}

	if (write) {
		if (!actor) return authRequired('Push requires a personal access token as the password.\n');
		const allowed = actor.id === project.owner_id || actor.role === 'admin';
		if (!allowed) return new Response('You do not have write access to this repository\n', { status: 403 });
	} else if (project.visibility === 'private') {
		if (!actor) return authRequired('This repository is private.\n');
		const allowed = actor.id === project.owner_id || actor.role === 'admin';
		if (!allowed) return new Response('Repository not found\n', { status: 404 });
	}

	if (!repoExists(project.owner_username, project.slug)) {
		return new Response('Repository not initialised\n', { status: 404 });
	}

	const response = await runGitBackend({
		repoDir: repoPath(project.owner_username, project.slug),
		pathInfo,
		method: request.method,
		queryString,
		headers: request.headers,
		body: request.body,
		remoteUser: actor?.username ?? ''
	});

	if (write && request.method === 'POST') {
		// The push is written by the time the backend's body is consumed by the
		// client, so index the new commits once the response finishes streaming.
		return indexAfterPush(response, project);
	}
	return response;
}

/** Wraps the response so commit indexing runs after the push stream completes. */
function indexAfterPush(response: Response, project: Target) {
	if (!response.body) {
		void syncCommits(project, project.owner_username).catch(console.error);
		return response;
	}

	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			const reader = response.body!.getReader();
			try {
				for (;;) {
					const { done, value } = await reader.read();
					if (done) break;
					controller.enqueue(value);
				}
				controller.close();
			} catch (error) {
				controller.error(error);
			} finally {
				try {
					const result = await syncCommits(project, project.owner_username);
					if (result.added) {
						console.log(`[git] ${project.owner_username}/${project.slug}: indexed ${result.added} commit(s)`);
					}
				} catch (error) {
					console.error('[git] post-push indexing failed', error);
				}
			}
		}
	});

	return new Response(stream, { status: response.status, headers: response.headers });
}

export const GET: RequestHandler = handle;
export const POST: RequestHandler = handle;

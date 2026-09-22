import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { count } from '$lib/server/db';
import { canView, getProject, toggleStar } from '$lib/server/projects';

export const POST: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) error(401, 'Sign in to star boards');

	const project = getProject(params.owner, params.project);
	if (!project || !canView(project, locals.user)) error(404, 'Board not found');

	const starred = toggleStar(locals.user.id, project.id);
	return json({
		starred,
		count: count('SELECT COUNT(*) FROM stars WHERE project_id = ?', project.id)
	});
};

import { get } from './db';
import { canView } from './projects';
import type { User } from './auth';

/** Visibility of the project a commit's artifacts belong to, or null if hidden. */
export function artifactAccess(commitId: string, viewer: User | null) {
	const owning = get<{ visibility: 'public' | 'private'; owner_id: string }>(
		'SELECT p.visibility, p.owner_id FROM commits c JOIN projects p ON p.id = c.project_id WHERE c.id = ?',
		commitId
	);
	if (!owning || !canView(owning, viewer)) return null;
	return owning.visibility;
}

/** Artifacts are immutable per commit, so public ones can be cached forever. */
export function artifactCacheControl(visibility: 'public' | 'private') {
	return visibility === 'public' ? 'public, max-age=31536000, immutable' : 'private, max-age=600';
}

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

/**
 * For SVG artifacts: they come out of the renderer, which parses uploaded boards,
 * and are served from our origin. Opened directly, an SVG is a document that could
 * run script; this allows only the inline styles and embedded images KiCad writes.
 */
export const SVG_POLICY = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; frame-ancestors 'self'; sandbox";

/** Artifacts are immutable per commit, so public ones can be cached forever. */
export function artifactCacheControl(visibility: 'public' | 'private') {
	return visibility === 'public' ? 'public, max-age=31536000, immutable' : 'private, max-age=600';
}

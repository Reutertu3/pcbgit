import { get } from './db';
import { canView } from './projects';
import type { User } from './auth';

/** Visibility of the project a commit's artifacts belong to, or null if hidden. */
export function artifactAccess(commitId: string, viewer: User | null) {
	const owning = get<{ id: string; visibility: 'public' | 'private'; owner_id: string }>(
		'SELECT p.id, p.visibility, p.owner_id FROM commits c JOIN projects p ON p.id = c.project_id WHERE c.id = ?',
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

/**
 * A versioned URL (`?v=`, or a raw file at a commit sha) never changes content, so
 * public ones can be cached forever. Without a version, a re-render replaces the file
 * under the same URL: cache it only briefly.
 */
export function artifactCacheControl(visibility: 'public' | 'private', versioned: boolean) {
	if (visibility === 'private') return 'private, max-age=600';
	return versioned ? 'public, max-age=31536000, immutable' : 'public, max-age=300';
}

import type { PageServerLoad } from './$types';
import { all, count } from '$lib/server/db';
import { kicadVersion } from '$lib/server/render/kicad';
import { queueStats } from '$lib/server/render/worker';
import { DATA_DIR } from '$lib/server/paths';
import { runningVersion, updateAvailability } from '$lib/server/updater';

interface AuditRow {
	action: string;
	target: string;
	detail: string;
	created_at: number;
	username: string | null;
}

interface FailingRow {
	id: string;
	sha: string;
	render_status: string;
	slug: string;
	username: string;
}

export const load: PageServerLoad = async () => ({
	stats: {
		users: count('SELECT COUNT(*) FROM users'),
		activeUsers: count('SELECT COUNT(*) FROM users WHERE is_active = 1'),
		projects: count('SELECT COUNT(*) FROM projects'),
		privateProjects: count("SELECT COUNT(*) FROM projects WHERE visibility = 'private'"),
		commits: count('SELECT COUNT(*) FROM commits'),
		failedRenders: count("SELECT COUNT(*) FROM commits WHERE render_status = 'failed'"),
		artifactBytes: count('SELECT COALESCE(SUM(size_bytes), 0) FROM artifacts'),
		comments: count('SELECT COUNT(*) FROM comments'),
		tokens: count('SELECT COUNT(*) FROM access_tokens')
	},
	queue: queueStats(),
	kicad: await kicadVersion(),
	version: runningVersion(),
	availability: updateAvailability(),
	dataDir: DATA_DIR,
	recent: all<AuditRow>(
		`SELECT a.action, a.target, a.detail, a.created_at, u.username
		 FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id
		 ORDER BY a.created_at DESC LIMIT 25`
	),
	failing: all<FailingRow>(
		`SELECT c.id, c.sha, c.render_status, p.slug, u.username
		 FROM commits c JOIN projects p ON p.id = c.project_id JOIN users u ON u.id = p.owner_id
		 WHERE c.render_status = 'failed' ORDER BY c.committed_at DESC, c.rowid DESC LIMIT 10`
	)
});

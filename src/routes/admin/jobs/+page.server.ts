import { fail } from '@sveltejs/kit';
import { translate } from '$lib/i18n';
import type { Actions, PageServerLoad } from './$types';
import { all, audit, get, now, run } from '$lib/server/db';
import { enqueueRender, kick, queueStats } from '$lib/server/render/worker';

interface AdminJobRow {
	id: string;
	status: string;
	attempts: number;
	error: string;
	queued_at: number;
	started_at: number | null;
	finished_at: number | null;
	commit_id: string;
	sha: string;
	message: string;
	slug: string;
	username: string;
}

export const load: PageServerLoad = async ({ url }) => {
	const status = url.searchParams.get('status') ?? '';
	const openLog = url.searchParams.get('log');

	return {
		jobs: all<AdminJobRow>(
			`SELECT j.id, j.status, j.attempts, j.error, j.queued_at, j.started_at, j.finished_at,
			   j.commit_id, c.sha, c.message, p.slug, u.username
			 FROM render_jobs j
			 JOIN commits c ON c.id = j.commit_id
			 JOIN projects p ON p.id = j.project_id
			 JOIN users u ON u.id = p.owner_id
			 WHERE (? = '' OR j.status = ?)
			 ORDER BY j.queued_at DESC LIMIT 150`,
			status,
			status
		),
		job: openLog
			? get<{ log: string; error: string; status: string }>(
					'SELECT log, error, status FROM render_jobs WHERE id = ?',
					openLog
				)
			: null,
		openLog,
		status,
		queue: queueStats(),
		counts: {
			queued: all<{ n: number }>("SELECT COUNT(*) AS n FROM render_jobs WHERE status = 'queued'")[0].n,
			running: all<{ n: number }>("SELECT COUNT(*) AS n FROM render_jobs WHERE status = 'running'")[0].n,
			success: all<{ n: number }>("SELECT COUNT(*) AS n FROM render_jobs WHERE status = 'success'")[0].n,
			failed: all<{ n: number }>("SELECT COUNT(*) AS n FROM render_jobs WHERE status = 'failed'")[0].n
		}
	};
};

export const actions: Actions = {
	retry: async ({ request, locals }) => {
		const id = String((await request.formData()).get('id') ?? '');
		const job = get<{ project_id: string; commit_id: string }>(
			'SELECT project_id, commit_id FROM render_jobs WHERE id = ?',
			id
		);
		if (!job) return fail(404, { error: translate(locals.locale, 'jobs.error.notFound') });

		enqueueRender(job.project_id, job.commit_id);
		audit(locals.user!.id, 'admin.job_retry', id);
		return { success: true, message: translate(locals.locale, 'jobs.requeued') };
	},

	retryAllFailed: async ({ locals }) => {
		const failed = all<{ project_id: string; commit_id: string }>(
			"SELECT DISTINCT project_id, commit_id FROM render_jobs WHERE status = 'failed'"
		);
		for (const job of failed) enqueueRender(job.project_id, job.commit_id);
		audit(locals.user!.id, 'admin.job_retry_all', String(failed.length));
		return { success: true, message: translate(locals.locale, 'jobs.requeuedN', { count: failed.length }) };
	},

	clearFinished: async ({ locals }) => {
		const removed = run("DELETE FROM render_jobs WHERE status IN ('success','failed')");
		audit(locals.user!.id, 'admin.job_clear', String(removed.changes));
		return { success: true, message: translate(locals.locale, 'jobs.cleared', { count: Number(removed.changes) }) };
	},

	unstick: async ({ locals }) => {
		// Jobs marked running with no worker behind them block nothing, but they
		// misreport the queue; reset them and prod the worker.
		const reset = run(
			`UPDATE render_jobs SET status = 'failed', error = 'Reset by administrator', finished_at = ?
			 WHERE status = 'running' AND started_at < ?`,
			now(),
			now() - 15 * 60 * 1000
		);
		run("UPDATE commits SET render_status = 'failed' WHERE render_status = 'running'");
		kick();
		audit(locals.user!.id, 'admin.job_unstick', String(reset.changes));
		return { success: true, message: translate(locals.locale, 'jobs.reset', { count: Number(reset.changes) }) };
	}
};

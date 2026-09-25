<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import Icon from '$lib/components/Icon.svelte';
	import Switch from '$lib/components/Switch.svelte';
	import StatusDot from '$lib/components/StatusDot.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import { relativeTime, shortSha } from '$lib/format';
	import { t } from '$lib/i18n/t';

	let { data, form } = $props();

	let autoRefresh = $state(false);

	// While work is in flight the queue is the one page worth polling.
	$effect(() => {
		if (!autoRefresh) return;
		const timer = setInterval(() => invalidateAll(), 4000);
		return () => clearInterval(timer);
	});

	function statusHref(status: string) {
		const params = new URLSearchParams();
		if (status) params.set('status', status);
		const query = params.toString();
		return `/admin-panel/jobs${query ? `?${query}` : ''}`;
	}

	function logHref(id: string) {
		const params = new URLSearchParams(page.url.searchParams);
		if (params.get('log') === id) params.delete('log');
		else params.set('log', id);
		return `/admin-panel/jobs?${params.toString()}`;
	}

	function duration(job: { started_at: number | null; finished_at: number | null }) {
		if (!job.started_at) return '—';
		const end = job.finished_at ?? Date.now();
		const seconds = (end - job.started_at) / 1000;
		return seconds < 60 ? `${seconds.toFixed(1)}s` : `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
	}
</script>

<svelte:head><title>{t('about.queue')} · {t('admin.title')} · {data.site.name}</title></svelte:head>

<div class="mb-4 flex flex-wrap items-center justify-between gap-2">
	<h2 class="text-lg font-semibold tracking-tight">{t('about.queue')}</h2>
	<div class="flex flex-wrap gap-2">
		<Switch bind:checked={autoRefresh} size="sm" class="text-xs text-[var(--text-secondary)]">{t('jobs.autoRefresh')}</Switch>
		<form method="POST" action="?/unstick" use:enhance>
			<button class="btn btn-sm" type="submit" title={t('jobs.unstickTitle')}>
				<Icon name="alert" size={13} /> {t('jobs.unstick')}
			</button>
		</form>
		<form method="POST" action="?/retryAllFailed" use:enhance>
			<button class="btn btn-sm" type="submit"><Icon name="refresh" size={13} /> {t('adminBoards.retryFailed')}</button>
		</form>
		<form method="POST" action="?/clearFinished" use:enhance>
			<button class="btn btn-sm" type="submit"><Icon name="trash" size={13} /> {t('jobs.clearFinished')}</button>
		</form>
	</div>
</div>

{#if data.diskLow}<FormError message={t('jobs.diskLow', data.diskLow)} />{/if}
{#if form?.message}<FormError message={form.message} kind="success" />{/if}
{#if form?.error}<FormError message={form.error} />{/if}

<div class="mb-4 flex flex-wrap gap-2">
	<a href={statusHref('')} class="chip !py-1" class:!border-[var(--accent)]={!data.status}>
		{t('common.all')}
	</a>
	{#each [['queued', data.counts.queued], ['running', data.counts.running], ['success', data.counts.success], ['failed', data.counts.failed]] as [status, n]}
		<a
			href={statusHref(status as string)}
			class="chip !py-1"
			class:!border-[var(--accent)]={data.status === status}
			class:!text-[var(--accent)]={data.status === status}
		>
			{t(`jobs.status.${status as 'queued'}`)} <span class="text-[var(--text-muted)]">{n}</span>
		</a>
	{/each}
</div>

<div class="surface overflow-x-auto">
	<table class="w-full text-left text-[0.8125rem]">
		<thead class="bg-s2 text-xs">
			<tr>
				<th class="px-3 py-2 font-semibold">{t('adminBoards.board')}</th>
				<th class="px-3 py-2 font-semibold">{t('jobs.version')}</th>
				<th class="px-3 py-2 font-semibold">{t('jobs.statusCol')}</th>
				<th class="px-3 py-2 font-semibold">{t('jobs.duration')}</th>
				<th class="px-3 py-2 font-semibold">{t('jobs.queuedCol')}</th>
				<th class="px-3 py-2"></th>
			</tr>
		</thead>
		<tbody>
			{#each data.jobs as job (job.id)}
				<tr class="border-t">
					<td class="px-3 py-2">
						<a href="/{job.username}/{job.slug}" class="mono truncate hover:text-[var(--accent)]">
							{job.username}/{job.slug}
						</a>
					</td>
					<td class="px-3 py-2">
						<span class="mono text-xs">{shortSha(job.sha)}</span>
						<span class="block max-w-48 truncate text-[0.6875rem] text-[var(--text-muted)]">{job.message}</span>
					</td>
					<td class="px-3 py-2">
						<StatusDot status={job.status} label />
						{#if job.attempts > 1}
							<span class="text-[0.6875rem] text-[var(--text-muted)]">· {t('jobs.try', { n: job.attempts })}</span>
						{/if}
					</td>
					<td class="px-3 py-2 text-xs tabular-nums text-[var(--text-muted)]">{duration(job)}</td>
					<td class="px-3 py-2 text-xs text-[var(--text-muted)]">{relativeTime(job.queued_at)}</td>
					<td class="px-3 py-2">
						<div class="flex justify-end gap-1">
							<a href={logHref(job.id)} class="btn btn-sm" title={t('history.log')}><Icon name="file" size={12} /></a>
							<form method="POST" action="?/retry" use:enhance>
								<input type="hidden" name="id" value={job.id} />
								<button class="btn btn-sm" type="submit" title={t('jobs.requeue')}><Icon name="refresh" size={12} /></button>
							</form>
						</div>
					</td>
				</tr>

				{#if data.openLog === job.id && data.job}
					<tr class="border-t bg-[var(--surface-0)]">
						<td colspan="6" class="px-3 py-2.5">
							{#if data.job.error}
								<p class="mb-2 text-xs" style:color="var(--err)">{data.job.error}</p>
							{/if}
							<pre class="mono max-h-80 overflow-auto whitespace-pre-wrap rounded border bg-s1 px-3 py-2 text-[0.6875rem] leading-relaxed text-[var(--text-secondary)]">{data.job.log || t('history.noLog')}</pre>
						</td>
					</tr>
				{/if}
			{/each}
		</tbody>
	</table>
	{#if !data.jobs.length}
		<p class="px-4 py-10 text-center text-sm text-[var(--text-muted)]">{t('jobs.none')}</p>
	{/if}
</div>

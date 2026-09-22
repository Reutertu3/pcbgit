<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import Icon from '$lib/components/Icon.svelte';
	import StatusDot from '$lib/components/StatusDot.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import { formatDateTime, relativeTime, shortSha } from '$lib/format';

	let { data, form } = $props();

	const base = $derived(`/${data.project.owner_username}/${data.project.slug}`);
	const jobByCommit = $derived(new Map(data.jobs.map((job) => [job.commit_id, job])));

	function logHref(commitId: string) {
		const params = new URLSearchParams(page.url.searchParams);
		if (params.get('log') === commitId) params.delete('log');
		else params.set('log', commitId);
		const query = params.toString();
		return `${base}/history${query ? `?${query}` : ''}`;
	}

	function duration(job: { started_at: number | null; finished_at: number | null } | undefined) {
		if (!job?.started_at || !job?.finished_at) return null;
		const seconds = (job.finished_at - job.started_at) / 1000;
		return seconds < 60 ? `${seconds.toFixed(1)}s` : `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
	}
</script>

<svelte:head><title>History · {data.project.name} · {data.site.name}</title></svelte:head>

<div class="mx-auto max-w-[1400px] px-4 py-4">
	{#if form?.message}<FormError message={form.message} kind="success" />{/if}
	{#if form?.error}<FormError message={form.error} />{/if}

	{#if !data.kicadAvailable}
		<FormError
			kind="info"
			message="kicad-cli is not available on this server, so renders produce metadata and a BOM only. Install KiCad or run the provided Docker image for full schematic, board, 3D and DRC output."
		/>
	{/if}

	<div class="mb-3 flex flex-wrap items-center justify-between gap-2">
		<h2 class="text-sm font-semibold">
			{data.commits.length} version{data.commits.length === 1 ? '' : 's'}
		</h2>
		{#if data.editable}
			<form method="POST" action="?/resync" use:enhance>
				<button class="btn btn-sm" type="submit" title="Look for commits pushed outside the app">
					<Icon name="refresh" size={13} /> Sync with repository
				</button>
			</form>
		{/if}
	</div>

	{#if !data.commits.length}
		<div class="surface traces px-6 py-16 text-center">
			<p class="text-sm text-[var(--text-secondary)]">
				No versions yet. Push to the repository to create the first one.
			</p>
		</div>
	{:else}
		<ol class="surface divide-y overflow-hidden">
			{#each data.commits as commit, index (commit.id)}
				{@const job = jobByCommit.get(commit.id)}
				{@const isCurrent = data.commit?.id === commit.id}
				{@const took = duration(job)}
				<li class:bg-s2={isCurrent}>
					<div class="flex flex-wrap items-start gap-3 px-4 py-3">
						<div class="pt-1"><StatusDot status={commit.render_status} /></div>

						<div class="min-w-0 flex-1">
							<div class="flex flex-wrap items-baseline gap-2">
								<a href="{base}?v={commit.sha}" class="text-sm font-medium hover:text-[var(--accent)]">
									{commit.message || '(no commit message)'}
								</a>
								{#if index === 0}<span class="chip !py-0 !text-[0.625rem]">latest</span>{/if}
							</div>
							<p class="mt-0.5 text-xs text-[var(--text-muted)]">
								<span class="mono">{shortSha(commit.sha)}</span>
								{#if commit.author_name}· {commit.author_name}{/if}
								· <time title={formatDateTime(commit.committed_at)}>{relativeTime(commit.committed_at)}</time>
								{#if took}· rendered in {took}{/if}
							</p>

							<div class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.6875rem] text-[var(--text-muted)]">
								{#if commit.board_width}
									<span><Icon name="ruler" size={10} class="inline" /> {commit.board_width}×{commit.board_height} mm</span>
								{/if}
								{#if commit.layer_count}<span>{commit.layer_count} layers</span>{/if}
								{#if commit.net_count}<span>{commit.net_count} nets</span>{/if}
								{#if commit.bom_count}<span>{commit.bom_count} BOM lines</span>{/if}
								{#if commit.drc_errors}
									<span style:color="var(--err)">{commit.drc_errors} DRC error{commit.drc_errors === 1 ? '' : 's'}</span>
								{/if}
								{#if commit.drc_warnings}
									<span style:color="var(--warn)">{commit.drc_warnings} warning{commit.drc_warnings === 1 ? '' : 's'}</span>
								{/if}
								{#if commit.erc_errors}
									<span style:color="var(--err)">{commit.erc_errors} ERC error{commit.erc_errors === 1 ? '' : 's'}</span>
								{/if}
							</div>
						</div>

						<div class="flex shrink-0 flex-wrap items-center gap-1">
							<a href="{base}?v={commit.sha}" class="btn btn-sm">View</a>
							<a href="{base}/bom?v={commit.sha}&compare={data.commits[index + 1]?.sha ?? ''}" class="btn btn-sm" title="Compare BOM with the previous version">
								<Icon name="list" size={12} />
							</a>
							<a href="{base}/archive/{commit.sha}.zip" class="btn btn-sm" title="Download source files">
								<Icon name="download" size={12} />
							</a>
							{#if job}
								<a href={logHref(commit.id)} class="btn btn-sm" title="Render log">
									<Icon name="file" size={12} />
								</a>
							{/if}
							{#if data.editable}
								<form method="POST" action="?/rerender" use:enhance>
									<input type="hidden" name="commit" value={commit.id} />
									<button class="btn btn-sm" type="submit" title="Render this version again">
										<Icon name="refresh" size={12} />
									</button>
								</form>
							{/if}
						</div>
					</div>

					{#if data.openLog === commit.id && data.job}
						<div class="border-t bg-[var(--surface-0)] px-4 py-3">
							<div class="mb-2 flex items-center gap-2 text-xs">
								<StatusDot status={data.job.status} label />
								<span class="text-[var(--text-muted)]">
									attempt {data.job.attempts} · queued {relativeTime(data.job.queued_at)}
								</span>
							</div>
							{#if data.job.error}
								<p class="mb-2 text-xs" style:color="var(--err)">{data.job.error}</p>
							{/if}
							<pre class="mono max-h-80 overflow-auto whitespace-pre-wrap rounded border bg-s1 px-3 py-2 text-[0.6875rem] leading-relaxed text-[var(--text-secondary)]">{data.job.log || 'No log output.'}</pre>
						</div>
					{/if}
				</li>
			{/each}
		</ol>
	{/if}
</div>

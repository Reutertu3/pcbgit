<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import EmptyTab from '$lib/components/EmptyTab.svelte';
	import type { ViolationRow } from '$lib/types';

	let { data } = $props();

	let severityFilter = $state<'all' | 'error' | 'warning'>('all');
	let sourceFilter = $state<'all' | ViolationRow['source']>('all');
	let expanded = $state<Record<string, boolean>>({});
	let search = $state('');

	const base = $derived(`/${data.project.owner_username}/${data.project.slug}`);
	const versionQuery = $derived(data.isHead ? '' : `?v=${data.commit?.sha}`);

	const SOURCES: { key: ViolationRow['source']; label: string; hint: string }[] = [
		{ key: 'drc', label: 'Design rules', hint: 'Clearance, width and manufacturability rules on the board' },
		{ key: 'unconnected', label: 'Unconnected', hint: 'Ratsnest connections with no copper between them' },
		{ key: 'schematic_parity', label: 'Schematic parity', hint: 'Differences between the board and the schematic' },
		{ key: 'erc', label: 'Electrical rules', hint: 'Electrical rule checks run on the schematic' }
	];

	const counts = $derived.by(() => {
		const tally = { error: 0, warning: 0, info: 0, exclusion: 0 };
		for (const violation of data.violations) tally[violation.severity]++;
		return tally;
	});

	const bySource = $derived(
		SOURCES.map((source) => ({
			...source,
			items: data.violations.filter((violation) => violation.source === source.key)
		})).filter((group) => group.items.length)
	);

	const visible = $derived.by(() => {
		const term = search.trim().toLowerCase();
		return bySource
			.map((group) => ({
				...group,
				items: group.items.filter(
					(violation) =>
						(severityFilter === 'all' || violation.severity === severityFilter) &&
						(sourceFilter === 'all' || violation.source === sourceFilter) &&
						(!term || `${violation.message} ${violation.detail} ${violation.rule}`.toLowerCase().includes(term))
				)
			}))
			.filter((group) => group.items.length)
	});

	const shownCount = $derived(visible.reduce((sum, group) => sum + group.items.length, 0));
	const clean = $derived(data.violations.length === 0 && data.commit?.render_status === 'success');

	const SEVERITY = {
		error: { color: 'var(--err)', icon: 'alert' as const, label: 'Error' },
		warning: { color: 'var(--warn)', icon: 'alert' as const, label: 'Warning' },
		info: { color: 'var(--info)', icon: 'info' as const, label: 'Info' },
		exclusion: { color: 'var(--text-muted)', icon: 'eyeOff' as const, label: 'Excluded' }
	};
</script>

<svelte:head><title>Checks · {data.project.name} · {data.site.name}</title></svelte:head>

<div class="mx-auto max-w-[1400px] px-4 py-4">
	{#if clean}
		<div class="surface flex flex-col items-center gap-3 px-6 py-16 text-center">
			<span
				class="flex h-12 w-12 items-center justify-center rounded-full"
				style:background="color-mix(in srgb, var(--ok) 15%, transparent)"
			>
				<Icon name="check" size={24} strokeWidth={2.4} style="color: var(--ok)" />
			</span>
			<h2 class="text-base font-semibold">All checks passed</h2>
			<p class="max-w-md text-sm text-[var(--text-secondary)]">
				KiCad reported no DRC or ERC violations for this version.
			</p>
		</div>
	{:else if !data.violations.length}
		<EmptyTab
			icon="shield"
			title="No check results for this version"
			message="DRC runs against the board file and ERC against the schematic. Results appear here once a render completes."
			status={data.commit?.render_status}
			project={data.project}
		/>
	{:else}
		<!-- Severity summary -->
		<div class="mb-4 grid gap-px overflow-hidden rounded-lg border bg-[var(--border-subtle)] sm:grid-cols-4">
			{#each [['error', 'Errors'], ['warning', 'Warnings'], ['info', 'Info'], ['exclusion', 'Excluded']] as [key, label]}
				{@const severity = key as keyof typeof SEVERITY}
				<button
					class="bg-s1 px-3 py-3 text-left transition-colors hover:bg-s2"
					class:!bg-s2={severityFilter === severity}
					onclick={() =>
						(severityFilter =
							severityFilter === severity ? 'all' : (severity as 'error' | 'warning'))}
					disabled={severity === 'info' || severity === 'exclusion'}
				>
					<div class="text-xs uppercase tracking-wide text-[var(--text-muted)]">{label}</div>
					<div class="mt-0.5 text-xl font-semibold" style:color={counts[severity] ? SEVERITY[severity].color : 'var(--text-muted)'}>
						{counts[severity]}
					</div>
				</button>
			{/each}
		</div>

		<!-- Controls -->
		<div class="mb-3 flex flex-wrap items-center gap-2">
			<div class="relative min-w-48 flex-1">
				<span class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
					<Icon name="search" size={13} />
				</span>
				<input class="input !py-1.5 !pl-8 text-[0.8125rem]" type="search" bind:value={search} placeholder="Filter violations…" />
			</div>
			<select class="select !w-auto !py-1.5 text-[0.8125rem]" bind:value={sourceFilter} aria-label="Filter by check type">
				<option value="all">All check types</option>
				{#each SOURCES as source}<option value={source.key}>{source.label}</option>{/each}
			</select>
			{#if severityFilter !== 'all'}
				<button class="btn btn-sm" onclick={() => (severityFilter = 'all')}>
					<Icon name="x" size={12} /> {severityFilter}s only
				</button>
			{/if}
			<div class="flex-1"></div>
			{#if data.reports.drc}
				<a href={data.reports.drc} download class="btn btn-sm"><Icon name="download" size={12} /> DRC JSON</a>
			{/if}
			{#if data.reports.erc}
				<a href={data.reports.erc} download class="btn btn-sm"><Icon name="download" size={12} /> ERC JSON</a>
			{/if}
		</div>

		{#if !shownCount}
			<p class="surface px-4 py-10 text-center text-sm text-[var(--text-muted)]">
				No violations match these filters.
			</p>
		{/if}

		{#each visible as group}
			<section class="surface mb-3 overflow-hidden">
				<header class="flex items-center gap-2 border-b bg-s2 px-3 py-2">
					<h2 class="text-sm font-semibold">{group.label}</h2>
					<span class="chip">{group.items.length}</span>
					<span class="hidden text-xs text-[var(--text-muted)] sm:inline">{group.hint}</span>
				</header>

				<ul>
					{#each group.items as violation (violation.id)}
						{@const severity = SEVERITY[violation.severity]}
						{@const open = expanded[violation.id]}
						<li class="border-b last:border-b-0">
							<div class="flex items-start gap-2.5 px-3 py-2.5">
								<Icon name={severity.icon} size={14} class="mt-0.5 shrink-0" style="color: {severity.color}" />

								<div class="min-w-0 flex-1">
									<p class="text-[0.8125rem] leading-snug">{violation.message}</p>
									<div class="mt-1 flex flex-wrap items-center gap-2 text-[0.6875rem] text-[var(--text-muted)]">
										{#if violation.rule}<span class="mono">{violation.rule}</span>{/if}
										{#if violation.layer}<span class="chip !px-1.5 !py-0">{violation.layer}</span>{/if}
										{#if violation.x_mm !== null && violation.y_mm !== null}
											<span class="mono">{violation.x_mm.toFixed(2)}, {violation.y_mm.toFixed(2)} mm</span>
										{/if}
									</div>

									{#if open && violation.detail}
										<pre class="mono mt-2 overflow-x-auto whitespace-pre-wrap rounded border bg-[var(--surface-0)] px-2.5 py-2 text-[0.6875rem] leading-relaxed text-[var(--text-secondary)]">{violation.detail}</pre>
									{/if}
								</div>

								<div class="flex shrink-0 items-center gap-1">
									{#if violation.detail}
										<button
											class="btn btn-ghost btn-sm !px-1.5"
											onclick={() => (expanded = { ...expanded, [violation.id]: !open })}
											title={open ? 'Hide details' : 'Show details'}
										>
											<Icon name="chevronDown" size={12} class={open ? 'rotate-180' : ''} />
										</button>
									{/if}
									{#if violation.x_mm !== null && violation.source !== 'erc'}
										<a class="btn btn-ghost btn-sm !px-1.5" href="{base}/pcb{versionQuery}" title="Show on the board">
											<Icon name="board" size={12} />
										</a>
									{/if}
								</div>
							</div>
						</li>
					{/each}
				</ul>
			</section>
		{/each}
	{/if}
</div>

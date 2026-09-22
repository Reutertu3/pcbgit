<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import Icon from '$lib/components/Icon.svelte';
	import EmptyTab from '$lib/components/EmptyTab.svelte';
	import { relativeTime, shortSha } from '$lib/format';

	let { data } = $props();

	type Column = 'refs' | 'quantity' | 'value' | 'footprint' | 'mpn';

	let search = $state('');
	let sortBy = $state<Column>('refs');
	let ascending = $state(true);
	let hideUnchanged = $state(false);

	const base = $derived(`/${data.project.owner_username}/${data.project.slug}`);
	const versionQuery = $derived(data.isHead ? '' : `?v=${data.commit?.sha}`);

	const rows = $derived(data.compare ? data.compare.diff : data.rows.map((row) => ({ ...row, change: 'same' as const })));

	const filtered = $derived.by(() => {
		const term = search.trim().toLowerCase();
		let list = rows;
		if (term) {
			list = list.filter((row) =>
				[row.refs, row.value, row.footprint, row.mpn, row.description]
					.join(' ')
					.toLowerCase()
					.includes(term)
			);
		}
		if (hideUnchanged && data.compare) list = list.filter((row) => row.change !== 'same');

		return [...list].sort((a, b) => {
			const left = a[sortBy];
			const right = b[sortBy];
			const result =
				typeof left === 'number' && typeof right === 'number'
					? left - right
					: String(left).localeCompare(String(right), undefined, { numeric: true });
			return ascending ? result : -result;
		});
	});

	const totals = $derived({
		lines: data.rows.length,
		parts: data.rows.filter((row) => !row.dnp).reduce((sum, row) => sum + row.quantity, 0),
		dnp: data.rows.filter((row) => row.dnp).length,
		unsourced: data.rows.filter((row) => !row.mpn && !row.dnp).length
	});

	const changeCounts = $derived.by(() => {
		if (!data.compare) return null;
		return {
			added: rows.filter((row) => row.change === 'added').length,
			removed: rows.filter((row) => row.change === 'removed').length,
			changed: rows.filter((row) => row.change === 'changed').length
		};
	});

	function sort(column: Column) {
		if (sortBy === column) ascending = !ascending;
		else {
			sortBy = column;
			ascending = true;
		}
	}

	function setCompare(value: string) {
		const params = new URLSearchParams(page.url.searchParams);
		if (value) params.set('compare', value);
		else params.delete('compare');
		const query = params.toString();
		goto(`${base}/bom${query ? `?${query}` : ''}`);
	}

	const CHANGE_STYLE = {
		added: { color: 'var(--ok)', mark: '+', label: 'Added' },
		removed: { color: 'var(--err)', mark: '−', label: 'Removed' },
		changed: { color: 'var(--warn)', mark: '~', label: 'Changed' },
		same: { color: 'transparent', mark: '', label: '' }
	};
</script>

<svelte:head><title>BOM · {data.project.name} · {data.site.name}</title></svelte:head>

<div class="mx-auto max-w-[1400px] px-4 py-4">
	{#if !data.rows.length}
		<EmptyTab
			icon="list"
			title="No bill of materials in this version"
			message="The BOM is extracted from the schematic's symbol fields. Parts marked 'exclude from BOM' are left out."
			status={data.commit?.render_status}
			project={data.project}
		/>
	{:else}
		<!-- Summary -->
		<div class="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
			<span><strong>{totals.lines}</strong> <span class="text-[var(--text-muted)]">line items</span></span>
			<span><strong>{totals.parts}</strong> <span class="text-[var(--text-muted)]">parts to place</span></span>
			{#if totals.dnp}
				<span><strong>{totals.dnp}</strong> <span class="text-[var(--text-muted)]">DNP</span></span>
			{/if}
			{#if totals.unsourced}
				<span title="Line items with no MPN field in the schematic">
					<strong style:color="var(--warn)">{totals.unsourced}</strong>
					<span class="text-[var(--text-muted)]">without an MPN</span>
				</span>
			{/if}
			<div class="flex-1"></div>
			<a href="{base}/bom/download{versionQuery}" class="btn btn-sm">
				<Icon name="download" size={13} /> CSV
			</a>
		</div>

		<!-- Controls -->
		<div class="mb-3 flex flex-wrap items-center gap-2">
			<div class="relative min-w-48 flex-1">
				<span class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
					<Icon name="search" size={13} />
				</span>
				<input
					class="input !py-1.5 !pl-8 text-[0.8125rem]"
					type="search"
					bind:value={search}
					placeholder="Filter by reference, value, footprint or MPN…"
				/>
			</div>

			{#if data.compareOptions.length}
				<select
					class="select !w-auto !py-1.5 text-[0.8125rem]"
					value={data.compare?.sha ?? ''}
					onchange={(event) => setCompare(event.currentTarget.value)}
					aria-label="Compare with another version"
				>
					<option value="">No comparison</option>
					{#each data.compareOptions as option}
						<option value={option.sha}>
							Compare with {shortSha(option.sha)} · {relativeTime(option.committed_at)}
						</option>
					{/each}
				</select>
			{/if}

			{#if data.compare}
				<label class="flex cursor-pointer items-center gap-1.5 text-xs text-[var(--text-secondary)]">
					<input type="checkbox" bind:checked={hideUnchanged} /> Changes only
				</label>
			{/if}
		</div>

		{#if changeCounts}
			<div class="mb-3 flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2 text-xs">
				<span class="text-[var(--text-muted)]">Compared with {shortSha(data.compare!.sha)}:</span>
				<span style:color="var(--ok)">+{changeCounts.added} added</span>
				<span style:color="var(--err)">−{changeCounts.removed} removed</span>
				<span style:color="var(--warn)">~{changeCounts.changed} changed</span>
				{#if !changeCounts.added && !changeCounts.removed && !changeCounts.changed}
					<span class="text-[var(--text-muted)]">identical</span>
				{/if}
			</div>
		{/if}

		<!-- Table -->
		<div class="surface overflow-x-auto">
			<table class="w-full text-left text-[0.8125rem]">
				<thead class="sticky top-0 bg-s2 text-xs">
					<tr>
						{#if data.compare}<th class="w-6 px-2 py-2"></th>{/if}
						{#each [['refs', 'References'], ['quantity', 'Qty'], ['value', 'Value'], ['footprint', 'Footprint'], ['mpn', 'MPN']] as [column, label]}
							<th class="px-3 py-2 font-semibold">
								<button
									class="flex items-center gap-1 hover:text-[var(--accent)]"
									onclick={() => sort(column as Column)}
								>
									{label}
									{#if sortBy === column}
										<Icon name="chevronDown" size={11} class={ascending ? 'rotate-180' : ''} />
									{/if}
								</button>
							</th>
						{/each}
						<th class="px-3 py-2 font-semibold">Description</th>
					</tr>
				</thead>
				<tbody>
					{#each filtered as row (row.id + row.change)}
						{@const style = CHANGE_STYLE[row.change]}
						<tr
							class="border-t transition-colors hover:bg-s2"
							class:opacity-55={row.dnp || row.change === 'removed'}
						>
							{#if data.compare}
								<td class="mono px-2 py-1.5 text-center font-bold" style:color={style.color} title={style.label}>
									{style.mark}
								</td>
							{/if}
							<td class="mono px-3 py-1.5 whitespace-nowrap">
								{row.refs}
								{#if row.dnp}<span class="chip ml-1 !px-1 !py-0 !text-[0.5625rem]">DNP</span>{/if}
							</td>
							<td class="mono px-3 py-1.5 tabular-nums">
								{row.quantity}
								{#if row.change === 'changed' && row.previousQuantity !== undefined && row.previousQuantity !== row.quantity}
									<span class="text-[0.6875rem] text-[var(--text-muted)]">was {row.previousQuantity}</span>
								{/if}
							</td>
							<td class="px-3 py-1.5 font-medium">{row.value}</td>
							<td class="mono px-3 py-1.5 text-[var(--text-secondary)]">{row.footprint}</td>
							<td class="mono px-3 py-1.5">
								{#if row.mpn}
									{row.mpn}
								{:else}
									<span class="text-[var(--text-muted)]">—</span>
								{/if}
							</td>
							<td class="max-w-md truncate px-3 py-1.5 text-[var(--text-secondary)]" title={row.description}>
								{#if row.datasheet}
									<a href={row.datasheet} rel="nofollow noopener" target="_blank" class="hover:text-[var(--accent)]">
										{row.description || 'Datasheet'}
										<Icon name="external" size={10} class="inline" />
									</a>
								{:else}
									{row.description}
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>

			{#if !filtered.length}
				<p class="px-4 py-10 text-center text-sm text-[var(--text-muted)]">
					No line items match that filter.
				</p>
			{/if}
		</div>
	{/if}
</div>

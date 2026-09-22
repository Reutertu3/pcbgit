<script lang="ts">
	import HeroBoard from '$lib/components/HeroBoard.svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import Icon from '$lib/components/Icon.svelte';
	import ProjectCardView from '$lib/components/ProjectCard.svelte';
	import TagChip from '$lib/components/TagChip.svelte';
	import { formatCount } from '$lib/format';

	let { data } = $props();

	const SORTS = [
		{ value: 'recent', label: 'Recently updated' },
		{ value: 'created', label: 'Newest' },
		{ value: 'stars', label: 'Most starred' },
		{ value: 'name', label: 'Name' }
	];


	/** Every filter is a URL parameter, so any view is linkable and shareable. */
	function withParam(mutate: (params: URLSearchParams) => void) {
		const params = new URLSearchParams(page.url.searchParams);
		params.delete('page');
		mutate(params);
		const query = params.toString();
		return query ? `/?${query}` : '/';
	}

	function toggleMulti(key: string, value: string) {
		return withParam((params) => {
			const current = params.getAll(key);
			params.delete(key);
			for (const existing of current) if (existing !== value) params.append(key, existing);
			if (!current.includes(value)) params.append(key, value);
		});
	}

	const activeFilterCount = $derived(
		data.filters.tags.length +
			(data.filters.license ? 1 : 0) +
			(data.filters.q ? 1 : 0)
	);
</script>

<svelte:head>
	<title>Browse boards · {data.site.name}</title>
</svelte:head>

<div class="mx-auto max-w-[1400px] px-4 py-6">
	{#if !data.filters.q && !activeFilterCount && data.page === 1}
		<section class="surface relative mb-6 overflow-hidden p-6 sm:p-8">
			<HeroBoard />
			<div class="relative max-w-2xl">
				<h1 class="text-2xl font-bold tracking-tight sm:text-3xl">{data.site.tagline}</h1>
				<p class="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
					Push a KiCad project with <span class="mono">git</span>, and get schematics, a layered board
					view, an assembled 3D model, a bill of materials and a DRC report — rendered automatically
					and versioned for every commit.
				</p>
				<div class="mt-5 flex flex-wrap items-center gap-5 text-sm">
					<span><strong class="text-lg">{formatCount(data.stats.boards)}</strong> <span class="text-[var(--text-muted)]">boards</span></span>
					<span><strong class="text-lg">{formatCount(data.stats.versions)}</strong> <span class="text-[var(--text-muted)]">versions</span></span>
					<span><strong class="text-lg">{formatCount(data.stats.designers)}</strong> <span class="text-[var(--text-muted)]">designers</span></span>
				</div>
			</div>
		</section>
	{/if}

	<div class="flex flex-col gap-6 lg:flex-row">
		<!-- Filters -->
		<aside class="lg:w-56 lg:shrink-0">
			<div class="lg:sticky lg:top-20 flex flex-col gap-5">
				{#if data.tags.length}
					<div>
						<h2 class="label !mb-2">Tags</h2>
						<div class="flex flex-wrap gap-1.5">
							{#each data.tags as tag}
								{@const active = data.filters.tags.includes(tag.slug)}
								<TagChip
									{tag}
									href={toggleMulti('tag', tag.slug)}
									{active}
									count={tag.project_count}
									title="{tag.project_count} board{tag.project_count === 1 ? '' : 's'}"
								/>
							{/each}
						</div>
						<a href="/tags" class="hint inline-block hover:text-[var(--accent)]">All tags →</a>
					</div>
				{/if}

				<div>
					<h2 class="label !mb-2">License</h2>
					<select
						class="select !py-1.5 text-[0.8125rem]"
						value={data.filters.license}
						onchange={(event) =>
							goto(withParam((params) => {
								const value = event.currentTarget.value;
								if (value) params.set('license', value);
								else params.delete('license');
							}))}
					>
						<option value="">Any license</option>
						{#each data.licenses as license}<option value={license}>{license}</option>{/each}
					</select>
				</div>

				{#if activeFilterCount > 0}
					<a href="/" class="btn btn-sm w-fit"><Icon name="x" size={12} /> Clear filters</a>
				{/if}
			</div>
		</aside>

		<!-- Results -->
		<div class="min-w-0 flex-1">
			<div class="mb-4 flex flex-wrap items-center justify-between gap-3">
				<p class="text-sm text-[var(--text-secondary)]">
					{#if data.total === 0}
						No boards found
					{:else}
						<strong>{formatCount(data.total)}</strong>
						board{data.total === 1 ? '' : 's'}
						{#if data.filters.q}matching <span class="mono text-[var(--text-primary)]">{data.filters.q}</span>{/if}
					{/if}
				</p>
				<select
					class="select !w-auto !py-1.5 text-[0.8125rem]"
					value={data.filters.sort}
					onchange={(event) =>
						goto(withParam((params) => params.set('sort', event.currentTarget.value)))}
					aria-label="Sort boards"
				>
					{#each SORTS as sort}<option value={sort.value}>{sort.label}</option>{/each}
				</select>
			</div>

			{#if data.projects.length === 0}
				<div class="surface traces flex flex-col items-center gap-3 px-6 py-16 text-center">
					<Icon name="board" size={32} class="text-[var(--text-muted)]" />
					<p class="text-sm text-[var(--text-secondary)]">
						{#if activeFilterCount}
							Nothing matches these filters.
						{:else}
							No boards here yet.
						{/if}
					</p>
					{#if activeFilterCount}
						<a href="/" class="btn btn-sm">Clear filters</a>
					{:else if data.user}
						<a href="/new" class="btn btn-primary btn-sm"><Icon name="plus" size={13} /> Create the first board</a>
					{:else}
						<a href="/login" class="btn btn-primary btn-sm">Sign in to publish a board</a>
					{/if}
				</div>
			{:else}
				<div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
					{#each data.projects as project (project.id)}
						<ProjectCardView {project} />
					{/each}
				</div>
			{/if}

			{#if data.pageCount > 1}
				<nav class="mt-6 flex items-center justify-center gap-2" aria-label="Pagination">
					<a
						href={withParam((params) => params.set('page', String(data.page - 1)))}
						class="btn btn-sm"
						class:pointer-events-none={data.page <= 1}
						class:opacity-40={data.page <= 1}
						aria-disabled={data.page <= 1}
					>
						<Icon name="chevronLeft" size={13} /> Previous
					</a>
					<span class="mono px-2 text-xs text-[var(--text-muted)]">
						Page {data.page} of {data.pageCount}
					</span>
					<a
						href={withParam((params) => params.set('page', String(data.page + 1)))}
						class="btn btn-sm"
						class:pointer-events-none={data.page >= data.pageCount}
						class:opacity-40={data.page >= data.pageCount}
						aria-disabled={data.page >= data.pageCount}
					>
						Next <Icon name="chevronRight" size={13} />
					</a>
				</nav>
			{/if}
		</div>
	</div>
</div>

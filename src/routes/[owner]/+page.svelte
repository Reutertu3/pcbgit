<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import ProjectCardView from '$lib/components/ProjectCard.svelte';
	import { formatCount, formatDate } from '$lib/format';
	import { t, tParts } from '$lib/i18n/t';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';

	let { data } = $props();

	const SORTS = $derived([
		{ value: 'recent', label: t('browse.sort.recent') },
		{ value: 'name', label: t('browse.sort.name') },
		{ value: 'created', label: t('browse.sort.created') },
		{ value: 'stars', label: t('browse.sort.stars') }
	]);

	/** Sort and page are URL parameters, like on the front page; a new sort starts at page 1. */
	function withParam(mutate: (params: URLSearchParams) => void) {
		const params = new URLSearchParams(page.url.searchParams);
		params.delete('page');
		mutate(params);
		const query = params.toString();
		return query ? `${page.url.pathname}?${query}` : page.url.pathname;
	}
</script>

<svelte:head><title>{data.owner.displayName} · {data.site.name}</title></svelte:head>

<div class="mx-auto max-w-[1400px] px-4 py-6">
	<header class="surface mb-5 flex flex-wrap items-start gap-4 p-5">
		<Avatar name={data.owner.displayName} username={data.owner.username} avatar={data.owner.avatar} size={64} />
		<div class="min-w-0 flex-1">
			<div class="flex flex-wrap items-center gap-2">
				<h1 class="text-xl font-semibold tracking-tight">{data.owner.displayName}</h1>
				<span class="mono text-sm text-[var(--text-muted)]">@{data.owner.username}</span>
				{#if data.owner.role === 'admin'}<span class="chip">{t('profile.admin')}</span>{/if}
				{#if !data.owner.isActive}<span class="chip" style:color="var(--err)">{t('profile.disabled')}</span>{/if}
			</div>
			{#if data.owner.bio}
				<p class="mt-1.5 max-w-2xl text-sm leading-relaxed text-[var(--text-secondary)]">{data.owner.bio}</p>
			{/if}
			<div class="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-[var(--text-muted)]">
				{#each [['profile.boards', data.total], ['profile.versions', data.counts.versions], ['profile.stars', data.counts.starsReceived]] as const as [key, n]}
					<span>{#each tParts(key, { count: n }) as part}{#if typeof part === 'string'}{part}{:else}<strong class="text-[var(--text-primary)]">{formatCount(n)}</strong>{/if}{/each}</span>
				{/each}
				<span>{t('profile.joined', { date: formatDate(data.owner.createdAt) })}</span>
			</div>
		</div>
		{#if data.isSelf}
			<div class="flex gap-2">
				<a href="/settings" class="btn btn-sm"><Icon name="settings" size={13} /> {t('nav.userCenter')}</a>
				<a href="/new" class="btn btn-primary btn-sm"><Icon name="plus" size={13} /> {t('nav.newBoard')}</a>
			</div>
		{/if}
	</header>

	{#if !data.projects.length}
		<div class="surface traces px-6 py-16 text-center">
			<Icon name="board" size={28} class="mx-auto text-[var(--text-muted)]" />
			<p class="mt-3 text-sm text-[var(--text-secondary)]">
				{data.isSelf ? t('profile.noBoardsSelf') : t('profile.noBoards')}
			</p>
			{#if data.isSelf}
				<a href="/new" class="btn btn-primary btn-sm mt-3"><Icon name="plus" size={13} /> {t('profile.createFirst')}</a>
			{/if}
		</div>
	{:else}
		{#if data.total > 1}
			<div class="mb-4 flex justify-end">
				<select
					class="select !w-auto !py-1.5 text-[0.8125rem]"
					value={data.sort}
					onchange={(event) => goto(withParam((params) => params.set('sort', event.currentTarget.value)))}
					aria-label={t('browse.sortLabel')}
				>
					{#each SORTS as sort}<option value={sort.value}>{sort.label}</option>{/each}
				</select>
			</div>
		{/if}
		<div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
			{#each data.projects as project (project.id)}
				<ProjectCardView {project} collaborator={project.owner_username !== data.owner.username} />
			{/each}
		</div>

		{#if data.pageCount > 1}
			<nav class="mt-6 flex items-center justify-center gap-2" aria-label={t('browse.pagination')}>
				<a
					href={withParam((params) => params.set('page', String(data.page - 1)))}
					class="btn btn-sm"
					class:pointer-events-none={data.page <= 1}
					class:opacity-40={data.page <= 1}
					aria-disabled={data.page <= 1}
				>
					<Icon name="chevronLeft" size={13} /> {t('browse.previous')}
				</a>
				<span class="mono px-2 text-xs text-[var(--text-muted)]">
					{t('browse.page', { page: data.page, pages: data.pageCount })}
				</span>
				<a
					href={withParam((params) => params.set('page', String(data.page + 1)))}
					class="btn btn-sm"
					class:pointer-events-none={data.page >= data.pageCount}
					class:opacity-40={data.page >= data.pageCount}
					aria-disabled={data.page >= data.pageCount}
				>
					{t('browse.next')} <Icon name="chevronRight" size={13} />
				</a>
			</nav>
		{/if}
	{/if}
</div>

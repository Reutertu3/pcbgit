<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import { formatBytes, relativeTime, shortSha } from '$lib/format';
	import Changelog from '$lib/components/Changelog.svelte';
	import { t, tParts } from '$lib/i18n/t';

	let { data } = $props();

	const CARDS = $derived([
		{ label: t('admin.nav.users'), value: data.stats.users, sub: t('admin.card.active', { n: data.stats.activeUsers }), href: '/admin-panel/users' },
		{ label: t('admin.nav.boards'), value: data.stats.projects, sub: t('admin.card.private', { n: data.stats.privateProjects }), href: '/admin-panel/projects' },
		{ label: t('admin.card.versions'), value: data.stats.commits, sub: t('admin.card.failed', { n: data.stats.failedRenders }), href: '/admin-panel/jobs' },
		{ label: t('overview.artifacts'), value: formatBytes(data.stats.artifactBytes), sub: t('admin.card.onDisk'), href: null },
		{ label: t('about.queue'), value: `${data.queue.running}/${data.queue.queued}`, sub: t('admin.card.runningQueued'), href: '/admin-panel/jobs' },
		{ label: t('nav.tokens'), value: data.stats.tokens, sub: t('admin.card.issued'), href: null }
	]);
</script>

<svelte:head><title>{t('admin.title')} · {data.site.name}</title></svelte:head>

<h2 class="mb-4 text-lg font-semibold tracking-tight">{t('admin.nav.overview')}</h2>

{#if data.availability && data.availability.behind > 0}
	<!-- Surfaced here so a pending update is seen without visiting Instance. -->
	<section
		class="mb-4 rounded-lg border p-4"
		style:border-color="color-mix(in srgb, var(--accent) 45%, transparent)"
		style:background="color-mix(in srgb, var(--accent) 7%, transparent)"
	>
		<div class="mb-2.5 flex flex-wrap items-center justify-between gap-2">
			<h3 class="flex items-center gap-2 text-sm font-semibold">
				<Icon name="download" size={14} class="text-[var(--accent)]" />
				{t('admin.updateAvailable', { count: data.availability.behind })}
				<span class="mono text-xs font-normal text-[var(--text-muted)]">{data.availability.current} → {data.availability.latest}</span>
			</h3>
			<a href="/admin-panel/settings#updates" class="btn btn-primary btn-sm">{t('admin.reviewUpdate')}</a>
		</div>
		<Changelog commits={data.availability.commits} limit={5} total={data.availability.behind} />
	</section>
{/if}

<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
	{#each CARDS as card}
		<svelte:element
			this={card.href ? 'a' : 'div'}
			href={card.href}
			class="surface p-4 {card.href ? 'transition-colors hover:border-[var(--border-strong)]' : ''}"
		>
			<p class="text-xs uppercase tracking-wide text-[var(--text-muted)]">{card.label}</p>
			<p class="mt-1 text-2xl font-semibold tabular-nums">{card.value}</p>
			<p class="text-xs text-[var(--text-muted)]">{card.sub}</p>
		</svelte:element>
	{/each}
</div>

<div class="mt-4 surface p-4">
	<h3 class="mb-2 text-sm font-semibold">{t('about.engine')}</h3>
	{#if data.kicad}
		<p class="mono flex items-center gap-2 text-xs" style:color="var(--ok)">
			<Icon name="check" size={13} /> {data.kicad}
		</p>
	{:else}
		<p class="flex items-start gap-2 text-xs leading-relaxed" style:color="var(--warn)">
			<Icon name="alert" size={14} class="mt-0.5 shrink-0" />
			<span>
				{#each tParts('admin.noKicad') as part}{#if typeof part === 'string'}{part}{:else}<span class="mono">PCBGIT_KICAD_CLI</span>{/if}{/each}
			</span>
		</p>
	{/if}
	<p class="mono mt-2 text-[0.6875rem] text-[var(--text-muted)]">
		pcbgit {data.version}
		{#if data.availability?.checked && data.availability.ok && data.availability.behind === 0}· {t('admin.upToDate', { time: relativeTime(data.availability.checked) })}{/if}
		· {t('admin.dataDir', { dir: data.dataDir })}
	</p>
</div>

{#if data.failing.length}
	<section class="surface mt-4 overflow-hidden">
		<h3 class="border-b px-4 py-2.5 text-sm font-semibold" style:color="var(--err)">
			{t('admin.failedRenders')}
		</h3>
		<ul class="divide-y text-sm">
			{#each data.failing as item}
				<li class="flex items-center justify-between gap-3 px-4 py-2">
					<a href="/{item.username}/{item.slug}/history?log={item.id}" class="mono truncate hover:text-[var(--accent)]">
						{item.username}/{item.slug} @ {shortSha(item.sha)}
					</a>
					<a href="/{item.username}/{item.slug}/history?log={item.id}" class="btn btn-sm">{t('admin.log')}</a>
				</li>
			{/each}
		</ul>
	</section>
{/if}

<section class="surface mt-4 overflow-hidden">
	<h3 class="border-b px-4 py-2.5 text-sm font-semibold">{t('admin.recent')}</h3>
	{#if !data.recent.length}
		<p class="px-4 py-8 text-center text-sm text-[var(--text-muted)]">{t('admin.nothingLogged')}</p>
	{:else}
		<ul class="divide-y text-sm">
			{#each data.recent as entry}
				<li class="flex flex-wrap items-center gap-2 px-4 py-2">
					<span class="mono chip !py-0 !text-[0.625rem]">{entry.action}</span>
					<span class="min-w-0 flex-1 truncate text-[var(--text-secondary)]">
						{entry.target}{entry.detail ? ` — ${entry.detail}` : ''}
					</span>
					<span class="text-xs text-[var(--text-muted)]">
						{entry.username ?? t('admin.system')} · {relativeTime(entry.created_at)}
					</span>
				</li>
			{/each}
		</ul>
	{/if}
</section>

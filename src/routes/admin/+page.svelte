<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import { formatBytes, relativeTime, shortSha } from '$lib/format';

	let { data } = $props();

	const CARDS = $derived([
		{ label: 'Users', value: data.stats.users, sub: `${data.stats.activeUsers} active`, href: '/admin/users' },
		{ label: 'Boards', value: data.stats.projects, sub: `${data.stats.privateProjects} private`, href: '/admin/projects' },
		{ label: 'Versions', value: data.stats.commits, sub: `${data.stats.failedRenders} failed`, href: '/admin/jobs' },
		{ label: 'Artifacts', value: formatBytes(data.stats.artifactBytes), sub: 'on disk', href: null },
		{ label: 'Render queue', value: `${data.queue.running}/${data.queue.queued}`, sub: 'running / queued', href: '/admin/jobs' },
		{ label: 'Access tokens', value: data.stats.tokens, sub: 'issued', href: null }
	]);
</script>

<svelte:head><title>Admin · {data.site.name}</title></svelte:head>

<h2 class="mb-4 text-lg font-semibold tracking-tight">Overview</h2>

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
	<h3 class="mb-2 text-sm font-semibold">Render engine</h3>
	{#if data.kicad}
		<p class="mono flex items-center gap-2 text-xs" style:color="var(--ok)">
			<Icon name="check" size={13} /> {data.kicad}
		</p>
	{:else}
		<p class="flex items-start gap-2 text-xs leading-relaxed" style:color="var(--warn)">
			<Icon name="alert" size={14} class="mt-0.5 shrink-0" />
			<span>
				kicad-cli was not found on this server. Versions are still tracked and a BOM is parsed from
				the schematic, but schematic, board, 3D and DRC output cannot be produced. Run the Docker
				image, or set <span class="mono">KUPFERGIT_KICAD_CLI</span> to the binary's path.
			</span>
		</p>
	{/if}
	<p class="mono mt-2 text-[0.6875rem] text-[var(--text-muted)]">Data directory: {data.dataDir}</p>
</div>

{#if data.failing.length}
	<section class="surface mt-4 overflow-hidden">
		<h3 class="border-b px-4 py-2.5 text-sm font-semibold" style:color="var(--err)">
			Failed renders
		</h3>
		<ul class="divide-y text-sm">
			{#each data.failing as item}
				<li class="flex items-center justify-between gap-3 px-4 py-2">
					<a href="/{item.username}/{item.slug}/history?log={item.id}" class="mono truncate hover:text-[var(--accent)]">
						{item.username}/{item.slug} @ {shortSha(item.sha)}
					</a>
					<a href="/{item.username}/{item.slug}/history?log={item.id}" class="btn btn-sm">Log</a>
				</li>
			{/each}
		</ul>
	</section>
{/if}

<section class="surface mt-4 overflow-hidden">
	<h3 class="border-b px-4 py-2.5 text-sm font-semibold">Recent activity</h3>
	{#if !data.recent.length}
		<p class="px-4 py-8 text-center text-sm text-[var(--text-muted)]">Nothing logged yet.</p>
	{:else}
		<ul class="divide-y text-sm">
			{#each data.recent as entry}
				<li class="flex flex-wrap items-center gap-2 px-4 py-2">
					<span class="mono chip !py-0 !text-[0.625rem]">{entry.action}</span>
					<span class="min-w-0 flex-1 truncate text-[var(--text-secondary)]">
						{entry.target}{entry.detail ? ` — ${entry.detail}` : ''}
					</span>
					<span class="text-xs text-[var(--text-muted)]">
						{entry.username ?? 'system'} · {relativeTime(entry.created_at)}
					</span>
				</li>
			{/each}
		</ul>
	{/if}
</section>

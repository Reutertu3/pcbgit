<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import ProjectCardView from '$lib/components/ProjectCard.svelte';
	import { formatCount, formatDate } from '$lib/format';

	let { data } = $props();
</script>

<svelte:head><title>{data.owner.displayName} · {data.site.name}</title></svelte:head>

<div class="mx-auto max-w-[1400px] px-4 py-6">
	<header class="surface mb-5 flex flex-wrap items-start gap-4 p-5">
		<Avatar name={data.owner.displayName} size={64} />
		<div class="min-w-0 flex-1">
			<div class="flex flex-wrap items-center gap-2">
				<h1 class="text-xl font-semibold tracking-tight">{data.owner.displayName}</h1>
				<span class="mono text-sm text-[var(--text-muted)]">@{data.owner.username}</span>
				{#if data.owner.role === 'admin'}<span class="chip">Admin</span>{/if}
				{#if !data.owner.isActive}<span class="chip" style:color="var(--err)">Disabled</span>{/if}
			</div>
			{#if data.owner.bio}
				<p class="mt-1.5 max-w-2xl text-sm leading-relaxed text-[var(--text-secondary)]">{data.owner.bio}</p>
			{/if}
			<div class="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-[var(--text-muted)]">
				<span><strong class="text-[var(--text-primary)]">{formatCount(data.total)}</strong> boards</span>
				<span><strong class="text-[var(--text-primary)]">{formatCount(data.counts.versions)}</strong> versions</span>
				<span><strong class="text-[var(--text-primary)]">{formatCount(data.counts.starsReceived)}</strong> stars received</span>
				<span>Joined {formatDate(data.owner.createdAt)}</span>
			</div>
		</div>
		{#if data.isSelf}
			<div class="flex gap-2">
				<a href="/settings" class="btn btn-sm"><Icon name="settings" size={13} /> Settings</a>
				<a href="/new" class="btn btn-primary btn-sm"><Icon name="plus" size={13} /> New board</a>
			</div>
		{/if}
	</header>

	{#if !data.projects.length}
		<div class="surface traces px-6 py-16 text-center">
			<Icon name="board" size={28} class="mx-auto text-[var(--text-muted)]" />
			<p class="mt-3 text-sm text-[var(--text-secondary)]">
				{data.isSelf ? 'You have no boards yet.' : 'No public boards here yet.'}
			</p>
			{#if data.isSelf}
				<a href="/new" class="btn btn-primary btn-sm mt-3"><Icon name="plus" size={13} /> Create your first board</a>
			{/if}
		</div>
	{:else}
		<div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
			{#each data.projects as project (project.id)}
				<ProjectCardView {project} />
			{/each}
		</div>
	{/if}
</div>

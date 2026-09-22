<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import ProjectCardView from '$lib/components/ProjectCard.svelte';
	import { t } from '$lib/i18n/t';

	let { data } = $props();
</script>

<svelte:head><title>{t('stars.title')} · {data.site.name}</title></svelte:head>

<div class="mx-auto max-w-[1400px] px-4 py-6">
	<h1 class="mb-4 flex items-center gap-2 text-xl font-semibold tracking-tight">
		<Icon name="star" size={18} /> {t('stars.title')}
		{#if data.total}<span class="chip">{data.total}</span>{/if}
	</h1>

	{#if !data.projects.length}
		<div class="surface traces px-6 py-16 text-center">
			<Icon name="star" size={28} class="mx-auto text-[var(--text-muted)]" />
			<p class="mt-3 text-sm text-[var(--text-secondary)]">
				{t('stars.empty')}
			</p>
			<a href="/" class="btn btn-sm mt-3">{t('browse.title')}</a>
		</div>
	{:else}
		<div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
			{#each data.projects as project (project.id)}
				<ProjectCardView {project} />
			{/each}
		</div>
	{/if}
</div>

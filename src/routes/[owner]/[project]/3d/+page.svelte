<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import Viewer3D from '$lib/components/Viewer3D.svelte';
	import EmptyTab from '$lib/components/EmptyTab.svelte';
	import { formatDimensions, shortSha } from '$lib/format';
	import { t } from '$lib/i18n/t';

	let { data } = $props();
	const size = $derived(formatDimensions(data.commit?.board_width ?? null, data.commit?.board_height ?? null));
</script>

<svelte:head><title>{t('tabs.3d')} · {data.project.name} · {data.site.name}</title></svelte:head>

<div class="mx-auto max-w-[1400px] px-4 py-4">
	{#if !data.modelUrl}
		<EmptyTab
			icon="cube"
			title={t('3d.emptyTitle')}
			message={t('3d.emptyMessage')}
			status={data.commit?.render_status}
			project={data.project}
		/>
	{:else}
		{#key data.modelUrl}
			<Viewer3D
				url={data.modelUrl}
				mounts={data.mounts}
				caption="{data.project.name} · {shortSha(data.commit?.sha)}"
				fileBase="{data.project.slug}-{shortSha(data.commit?.sha)}"
				class="h-[calc(100vh-15rem)] min-h-[32rem]"
			/>
		{/key}
		<div class="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--text-muted)]">
			<span>
				{t('3d.hint')}
				{#if size}<span class="mono ml-1">{size}</span>{/if}
			</span>
			<a href={data.modelUrl} download class="flex items-center gap-1 hover:text-[var(--accent)]">
				<Icon name="download" size={12} /> {t('3d.downloadGlb')}
			</a>
		</div>
	{/if}
</div>

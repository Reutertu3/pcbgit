<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import Viewer3D from '$lib/components/Viewer3D.svelte';
	import EmptyTab from '$lib/components/EmptyTab.svelte';
	import { formatDimensions } from '$lib/format';

	let { data } = $props();
	const size = $derived(formatDimensions(data.commit?.board_width ?? null, data.commit?.board_height ?? null));
</script>

<svelte:head><title>3D · {data.project.name} · {data.site.name}</title></svelte:head>

<div class="mx-auto max-w-[1400px] px-4 py-4">
	{#if !data.modelUrl}
		<EmptyTab
			icon="cube"
			title="No 3D model in this version"
			message="The assembled model is built from the board plus the STEP models attached to each footprint. Footprints without a 3D model are simply absent from the render."
			status={data.commit?.render_status}
			project={data.project}
		/>
	{:else}
		{#key data.modelUrl}
			<Viewer3D url={data.modelUrl} class="h-[calc(100vh-15rem)] min-h-[32rem]" />
		{/key}
		<div class="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--text-muted)]">
			<span>
				Drag to orbit, scroll to zoom, right-drag to pan.
				{#if size}<span class="mono ml-1">{size}</span>{/if}
			</span>
			<a href={data.modelUrl} download class="flex items-center gap-1 hover:text-[var(--accent)]">
				<Icon name="download" size={12} /> Download GLB
			</a>
		</div>
	{/if}
</div>

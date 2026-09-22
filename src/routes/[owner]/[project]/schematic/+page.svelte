<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import PanZoom from '$lib/components/PanZoom.svelte';
	import EmptyTab from '$lib/components/EmptyTab.svelte';
	import { parseViewBox } from '$lib/viewbox';

	let { data } = $props();

	let index = $state(0);
	let inverted = $state(false);

	const sheet = $derived(data.sheets[index]);
	const box = $derived(parseViewBox(sheet?.viewBox));
</script>

<svelte:head><title>Schematic · {data.project.name} · {data.site.name}</title></svelte:head>

<div class="mx-auto max-w-[1400px] px-4 py-4">
	{#if !data.sheets.length}
		<EmptyTab
			icon="schematic"
			title="No schematic in this version"
			message="Schematics are rendered from the .kicad_sch file at the root of the project."
			status={data.commit?.render_status}
			project={data.project}
		/>
	{:else}
		{#if data.sheets.length > 1}
			<!-- Hierarchical designs export one SVG per sheet. -->
			<div class="mb-3 flex flex-wrap items-center gap-1.5">
				<span class="mr-1 text-xs text-[var(--text-muted)]">Sheets</span>
				{#each data.sheets as item, i}
					<button
						class="chip !py-1 transition-colors"
						class:!border-[var(--accent)]={index === i}
						class:!text-[var(--accent)]={index === i}
						class:!bg-[var(--accent-soft)]={index === i}
						onclick={() => (index = i)}
					>
						{item.name}
					</button>
				{/each}
			</div>
		{/if}

		{#key index}
			<PanZoom
				contentWidth={box.width}
				contentHeight={box.height}
				class="h-[calc(100vh-15rem)] min-h-[32rem]"
				background={inverted ? '#ffffff' : 'var(--viewer-bg)'}
			>
				{#snippet toolbar()}
					<div class="flex overflow-hidden rounded-md border bg-[var(--surface-1)]/92 backdrop-blur">
						<button
							class="viewer-btn !w-auto gap-1.5 px-2 text-xs"
							onclick={() => (inverted = !inverted)}
							title="Toggle sheet background"
						>
							<Icon name={inverted ? 'moon' : 'sun'} size={12} />
							{inverted ? 'Dark' : 'Light'}
						</button>
						<a class="viewer-btn border-l" href={sheet.url} download title="Download this sheet as SVG">
							<Icon name="download" size={13} />
						</a>
					</div>
				{/snippet}

				<img
					src={sheet.url}
					alt="Schematic sheet {sheet.name}"
					class="block h-full w-full"
					style:filter={inverted ? 'none' : 'invert(1) hue-rotate(180deg) saturate(0.85) brightness(1.15)'}
					draggable="false"
				/>
			</PanZoom>
		{/key}

		<p class="mt-2 text-xs text-[var(--text-muted)]">
			Scroll to zoom, drag to pan, double-click to fit.
			<span class="kbd ml-1">F</span> fits, <span class="kbd">+</span>/<span class="kbd">−</span> zoom.
		</p>
	{/if}
</div>

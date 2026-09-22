<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import PanZoom from '$lib/components/PanZoom.svelte';
	import EmptyTab from '$lib/components/EmptyTab.svelte';
	import { unionViewBox } from '$lib/viewbox';

	let { data } = $props();

	const box = $derived(unionViewBox(data.layers.map((layer) => layer.viewBox)));

	/** Layer visibility, seeded from each layer's sensible default. */
	let visible = $state<Record<string, boolean>>({});
	let flipped = $state(false);
	let showMarkers = $state(true);
	let panelOpen = $state(true);

	$effect(() => {
		const next: Record<string, boolean> = {};
		for (const layer of data.layers) next[layer.name] = layer.style.defaultOn;
		visible = next;
	});

	// Copper reads correctly only when the side you are looking at is on top.
	const ordered = $derived(
		[...data.layers].sort((a, b) =>
			flipped ? b.style.order - a.style.order : a.style.order - b.style.order
		)
	);

	const groups = $derived(
		[
			['Copper', 'copper'],
			['Silkscreen', 'silkscreen'],
			['Soldermask', 'mask'],
			['Paste', 'paste'],
			['Outline', 'outline'],
			['Fabrication', 'fabrication']
		]
			.map(([label, key]) => ({
				label,
				layers: data.layers.filter((layer) => layer.style.group === key)
			}))
			.filter((group) => group.layers.length)
	);

	const bbox = $derived.by(() => {
		try {
			return JSON.parse(data.commit?.board_bbox || 'null') as {
				minX: number;
				minY: number;
				maxX: number;
				maxY: number;
			} | null;
		} catch {
			return null;
		}
	});

	/** Board millimetres to viewBox units, using the outline as the reference frame. */
	function toContent(xMm: number, yMm: number) {
		if (!bbox) return null;
		const spanX = bbox.maxX - bbox.minX;
		const spanY = bbox.maxY - bbox.minY;
		if (spanX <= 0 || spanY <= 0) return null;
		const nx = (xMm - bbox.minX) / spanX;
		const ny = (yMm - bbox.minY) / spanY;
		// Markers are drawn inside the flipped container, which mirrors them already.
		return { x: nx * box.width, y: ny * box.height };
	}

	function applyPreset(preset: 'front' | 'back' | 'copper' | 'all' | 'none') {
		const next: Record<string, boolean> = {};
		for (const layer of data.layers) {
			const side = layer.style.side;
			next[layer.name] =
				preset === 'all'
					? true
					: preset === 'none'
						? layer.style.group === 'outline'
						: preset === 'copper'
							? layer.style.group === 'copper' || layer.style.group === 'outline'
							: side === preset || side === 'both';
		}
		visible = next;
		if (preset === 'back') flipped = true;
		if (preset === 'front') flipped = false;
	}

	const visibleCount = $derived(Object.values(visible).filter(Boolean).length);
	const markerCount = $derived(data.markers.length);
</script>

<svelte:head><title>PCB · {data.project.name} · {data.site.name}</title></svelte:head>

<div class="mx-auto max-w-[1400px] px-4 py-4">
	{#if !data.layers.length}
		<EmptyTab
			icon="board"
			title="No board layout in this version"
			message="Layer views are rendered from the .kicad_pcb file at the root of the project."
			status={data.commit?.render_status}
			project={data.project}
		/>
	{:else}
		<div class="flex flex-col gap-3 lg:flex-row">
			<!-- Layer panel -->
			<aside class="lg:w-56 lg:shrink-0">
				<div class="surface overflow-hidden">
					<button
						class="flex w-full items-center justify-between px-3 py-2 text-left"
						onclick={() => (panelOpen = !panelOpen)}
					>
						<span class="flex items-center gap-1.5 text-xs font-semibold">
							<Icon name="layers" size={13} /> Layers
							<span class="chip !px-1.5 !py-0 !text-[0.625rem]">{visibleCount}</span>
						</span>
						<Icon name={panelOpen ? 'chevronDown' : 'chevronRight'} size={13} />
					</button>

					{#if panelOpen}
						<div class="border-t p-2">
							<div class="mb-2 flex flex-wrap gap-1">
								{#each [['front', 'Front'], ['back', 'Back'], ['copper', 'Copper'], ['all', 'All'], ['none', 'None']] as [preset, label]}
									<button class="btn btn-sm !px-1.5 !py-0.5 !text-[0.6875rem]" onclick={() => applyPreset(preset as never)}>
										{label}
									</button>
								{/each}
							</div>

							{#each groups as group}
								<div class="mb-2 last:mb-0">
									<p class="mb-1 px-1 text-[0.625rem] uppercase tracking-wide text-[var(--text-muted)]">
										{group.label}
									</p>
									{#each group.layers as layer}
										<label class="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-s2">
											<input
												type="checkbox"
												class="sr-only"
												bind:checked={visible[layer.name]}
											/>
											<span
												class="h-3 w-3 shrink-0 rounded-sm border transition-all"
												style:background={visible[layer.name] ? layer.style.color : 'transparent'}
												style:border-color={layer.style.color}
												style:opacity={visible[layer.name] ? 1 : 0.5}
											></span>
											<span
												class="mono flex-1 truncate text-[0.6875rem]"
												class:text-[var(--text-muted)]={!visible[layer.name]}
												title={layer.style.label}
											>
												{layer.name}
											</span>
										</label>
									{/each}
								</div>
							{/each}
						</div>
					{/if}
				</div>

				{#if markerCount}
					<label class="surface mt-2 flex cursor-pointer items-center gap-2 px-3 py-2 text-xs">
						<input type="checkbox" bind:checked={showMarkers} class="accent-[var(--err)]" />
						<Icon name="alert" size={12} style="color: var(--err)" />
						<span class="flex-1">DRC markers</span>
						<span class="chip !px-1.5 !py-0 !text-[0.625rem]">{markerCount}</span>
					</label>
					{#if !bbox}
						<p class="hint px-1">Marker positions need a board outline on Edge.Cuts.</p>
					{/if}
				{/if}
			</aside>

			<!-- Board -->
			<div class="min-w-0 flex-1">
				<PanZoom
					contentWidth={box.width}
					contentHeight={box.height}
					class="h-[calc(100vh-15rem)] min-h-[32rem]"
				>
					{#snippet toolbar()}
						<div class="flex overflow-hidden rounded-md border bg-[var(--surface-1)]/92 backdrop-blur">
							<button
								class="viewer-btn !w-auto gap-1.5 px-2 text-xs"
								onclick={() => (flipped = !flipped)}
								title="Flip the board over"
							>
								<Icon name="refresh" size={12} />
								{flipped ? 'Back' : 'Front'}
							</button>
						</div>
					{/snippet}

					<div
						class="relative h-full w-full"
						style:transform={flipped ? 'scaleX(-1)' : 'none'}
					>
						{#each ordered as layer (layer.id)}
							{#if visible[layer.name]}
								<!-- Screen blending makes stacked layers add up like light, not paint. -->
								<img
									src={layer.url}
									alt=""
									class="absolute inset-0 h-full w-full"
									style:mix-blend-mode="screen"
									draggable="false"
								/>
							{/if}
						{/each}

						{#if showMarkers && bbox}
							<svg
								class="pointer-events-none absolute inset-0 h-full w-full"
								viewBox="0 0 {box.width} {box.height}"
								preserveAspectRatio="none"
								aria-hidden="true"
							>
								{#each data.markers as marker}
									{@const point = toContent(marker.x_mm ?? 0, marker.y_mm ?? 0)}
									{#if point}
										{@const color = marker.severity === 'error' ? '#ff5252' : '#ffc046'}
										{@const radius = box.width * 0.012}
										<g>
											<circle cx={point.x} cy={point.y} r={radius} fill="none" stroke={color} stroke-width={radius * 0.28} opacity="0.95" />
											<circle cx={point.x} cy={point.y} r={radius * 0.22} fill={color} />
										</g>
									{/if}
								{/each}
							</svg>
						{/if}
					</div>
				</PanZoom>

				<div class="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--text-muted)]">
					<span>
						Scroll to zoom, drag to pan. <span class="kbd">F</span> fits.
						{#if flipped}Viewing from the back — the board is mirrored.{/if}
					</span>
					{#if markerCount}
						<a href="/{data.project.owner_username}/{data.project.slug}/drc" class="hover:text-[var(--accent)]">
							{markerCount} located violation{markerCount === 1 ? '' : 's'} →
						</a>
					{/if}
				</div>
			</div>
		</div>
	{/if}
</div>

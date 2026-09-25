<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import Switch from '$lib/components/Switch.svelte';
	import PanZoom from '$lib/components/PanZoom.svelte';
	import EmptyTab from '$lib/components/EmptyTab.svelte';
	import { unionViewBox } from '$lib/viewbox';
	import { t, tParts } from '$lib/i18n/t';
	import type { MessageKey } from '$lib/i18n';

	let { data } = $props();

	const box = $derived(unionViewBox(data.layers.map((layer) => layer.viewBox)));

	/** Layer visibility, seeded from each layer's sensible default. */
	let visible = $state<Record<string, boolean>>({});
	let flipped = $state(false);
	// Off unless the Checks tab sent us here to look at one.
	let showMarkers = $state(false);
	let panZoom = $state<ReturnType<typeof PanZoom> | null>(null);
	let panelOpen = $state(true);

	$effect(() => {
		const next: Record<string, boolean> = {};
		for (const layer of data.layers) next[layer.name] = layer.style.defaultOn;
		visible = next;
	});

	// Arriving from "Show on the board": markers on, the violation's side facing up,
	// zoomed in on it. Keyed by id, so picking another violation refocuses.
	let focusedId = $state<string | null>(null);
	$effect(() => {
		const focus = data.focus;
		if (!focus || focus.id === focusedId || !panZoom) return;
		const point = toContent(focus.x_mm ?? 0, focus.y_mm ?? 0);
		if (!point) return;
		focusedId = focus.id;
		showMarkers = true;
		// A back-side problem needs the back layers, seen from the back.
		if (focus.layer?.startsWith('B.')) applyPreset('back');
		else flipped = false;
		// Markers are mirrored with the board, so the screen position mirrors too.
		const x = flipped ? box.width - point.x : point.x;
		// About 15 mm of board across the view, whatever the board size.
		const zoom = bbox ? Math.min(Math.max((bbox.maxX - bbox.minX) / 15, 2), 20) : 4;
		// After PanZoom's own first fit, which runs once it has measured the viewport.
		requestAnimationFrame(() => panZoom?.focus(x, point.y, zoom));
	});

	// Copper reads correctly only when the side you are looking at is on top.
	const ordered = $derived(
		[...data.layers].sort((a, b) =>
			flipped ? b.style.order - a.style.order : a.style.order - b.style.order
		)
	);

	const groups = $derived(
		[
			[t('layerGroup.copper'), 'copper'],
			[t('layerGroup.silkscreen'), 'silkscreen'],
			[t('layerGroup.mask'), 'mask'],
			[t('layerGroup.paste'), 'paste'],
			[t('layerGroup.outline'), 'outline'],
			[t('layerGroup.fabrication'), 'fabrication']
		]
			.map(([label, key]) => ({
				label,
				layers: data.layers.filter((layer) => layer.style.group === key)
			}))
			.filter((group) => group.layers.length)
	);

	/** Layer descriptions are stored in English with the render; shown in the viewer's language. */
	function layerLabel(name: string, stored: string) {
		const inner = /^In(\d+)\.Cu$/.exec(name);
		if (inner) return t('layer.inner', { n: inner[1] });
		const key = `layer.${name}` as MessageKey;
		const text = t(key);
		return text === key ? stored : text;
	}

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
							: // Inner copper is stored as "both" sides but belongs to neither view.
								side === preset || (side === 'both' && layer.style.group !== 'copper');
		}
		visible = next;
		if (preset === 'back') flipped = true;
		if (preset === 'front') flipped = false;
	}

	/** The focused violation is drawn even when it is outside the capped marker list. */
	const drawnMarkers = $derived(
		data.focus && !data.markers.some((marker) => marker.id === data.focus!.id) ? [...data.markers, data.focus] : data.markers
	);

	const visibleCount = $derived(Object.values(visible).filter(Boolean).length);
	const markerCount = $derived(data.markers.length);
</script>

<svelte:head><title>PCB · {data.project.name} · {data.site.name}</title></svelte:head>

<div class="mx-auto max-w-[1400px] px-4 py-4">
	{#if !data.layers.length}
		<EmptyTab
			icon="board"
			title={t('pcb.emptyTitle')}
			message={t('pcb.emptyMessage')}
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
							<Icon name="layers" size={13} /> {t('pcb.layers')}
							<span class="chip !px-1.5 !py-0 !text-[0.625rem]">{visibleCount}</span>
						</span>
						<Icon name={panelOpen ? 'chevronDown' : 'chevronRight'} size={13} />
					</button>

					{#if panelOpen}
						<div class="border-t p-2">
							<div class="mb-2 flex flex-wrap gap-1">
								{#each [['front', t('common.front')], ['back', t('common.back')], ['copper', t('layerGroup.copper')], ['all', t('common.all')], ['none', t('common.none')]] as [preset, label]}
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
												title={layerLabel(layer.name, layer.style.label)}
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
					<div class="surface mt-2 px-3 py-2 text-xs">
						<Switch bind:checked={showMarkers} size="sm" class="w-full">
							<span class="flex items-center gap-2">
								<Icon name="alert" size={12} style="color: var(--err)" />
								<span class="flex-1">{t('pcb.markers')}</span>
								<span class="chip !px-1.5 !py-0 !text-[0.625rem]">{markerCount}</span>
							</span>
						</Switch>
					</div>
					{#if !bbox}
						<p class="hint px-1">{t('pcb.markersNeedOutline')}</p>
					{/if}
				{/if}
			</aside>

			<!-- Board -->
			<div class="min-w-0 flex-1">
				<PanZoom
					bind:this={panZoom}
					contentWidth={box.width}
					contentHeight={box.height}
					class="h-[calc(100vh-15rem)] min-h-[32rem]"
				>
					{#snippet toolbar()}
						<div class="flex overflow-hidden rounded-md border bg-[var(--surface-1)]/92 backdrop-blur">
							<button
								class="viewer-btn !w-auto gap-1.5 px-2 text-xs"
								onclick={() => (flipped = !flipped)}
								title={t('pcb.flip')}
							>
								<Icon name="refresh" size={12} />
								{flipped ? t('common.back') : t('common.front')}
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
								{#each drawnMarkers as marker}
									{@const point = toContent(marker.x_mm ?? 0, marker.y_mm ?? 0)}
									{#if point}
										{@const color = marker.severity === 'error' ? '#ff5252' : '#ffc046'}
										{@const radius = box.width * 0.012}
										<g>
											<circle cx={point.x} cy={point.y} r={radius} fill="none" stroke={color} stroke-width={radius * 0.28} opacity="0.95" />
											<circle cx={point.x} cy={point.y} r={radius * 0.22} fill={color} />
											{#if marker.id === focusedId}
												<circle cx={point.x} cy={point.y} r={radius * 1.9} fill="none" stroke={color} stroke-width={radius * 0.16} stroke-dasharray="{radius * 0.5} {radius * 0.35}" />
											{/if}
										</g>
									{/if}
								{/each}
							</svg>
						{/if}
					</div>
				</PanZoom>

				<div class="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--text-muted)]">
					<span>
						{#each tParts('pcb.hint') as part}
							{#if typeof part === 'string'}{part}{:else}<span class="kbd">F</span>{/if}
						{/each}
						{#if flipped}{t('pcb.mirrored')}{/if}
					</span>
					{#if markerCount}
						<a href="/{data.project.owner_username}/{data.project.slug}/drc" class="hover:text-[var(--accent)]">
							{t('pcb.located', { count: markerCount })} →
						</a>
					{/if}
				</div>
			</div>
		</div>
	{/if}
</div>

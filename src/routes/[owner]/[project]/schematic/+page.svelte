<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import PanZoom from '$lib/components/PanZoom.svelte';
	import EmptyTab from '$lib/components/EmptyTab.svelte';
	import { parseViewBox } from '$lib/viewbox';
	import { shortSha } from '$lib/format';

	let { data } = $props();

	let index = $state(0);
	let inverted = $state(false);

	const sheet = $derived(data.sheets[index]);
	const box = $derived(parseViewBox(sheet?.viewBox));

	/* ---- export the current sheet as a raster image ---- */
	const DARK_FILTER = 'invert(1) hue-rotate(180deg) saturate(0.85) brightness(1.15)';
	/** Canvas limits: 16k px per side everywhere; keep area sane for Safari too. */
	const MAX_EDGE = 16384;
	const MAX_PIXELS = 100_000_000;

	let exportOpen = $state(false);
	let exporting = $state(false);
	let exportError = $state<string | null>(null);
	let dpi = $state(300);
	let look = $state<'shown' | 'light' | 'dark'>('shown');
	let format = $state<'png' | 'jpeg'>('png');

	/** KiCad sheet SVGs use millimetres for their viewBox. */
	function exportSize(dotsPerInch: number) {
		let width = Math.round((box.width / 25.4) * dotsPerInch);
		let height = Math.round((box.height / 25.4) * dotsPerInch);
		const shrink = Math.min(1, MAX_EDGE / Math.max(width, height), Math.sqrt(MAX_PIXELS / (width * height)));
		width = Math.round(width * shrink);
		height = Math.round(height * shrink);
		return { width, height, clamped: shrink < 1 };
	}
	const size = $derived(exportSize(dpi));

	async function exportSheet() {
		exporting = true;
		exportError = null;
		try {
			const image = new Image();
			image.src = sheet.url;
			await image.decode();

			const { width, height } = size;
			const canvas = document.createElement('canvas');
			canvas.width = width;
			canvas.height = height;
			const ctx = canvas.getContext('2d');
			if (!ctx) throw new Error('This browser cannot create an image that large.');

			const dark = look === 'dark' || (look === 'shown' && !inverted);
			// Paint the paper first, in case the SVG has no background of its own.
			ctx.fillStyle = '#ffffff';
			ctx.fillRect(0, 0, width, height);
			if (dark) {
				ctx.filter = DARK_FILTER;
				// Browsers without canvas filters (Safari) leave this at "none".
				if (ctx.filter === 'none') throw new Error('This browser cannot export the dark look; choose Light.');
			}
			// Drawing the SVG at the target size rasterises the vectors at full resolution.
			ctx.drawImage(image, 0, 0, width, height);

			const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, `image/${format}`, 0.92));
			if (!blob) throw new Error('The browser could not encode the image.');
			const link = document.createElement('a');
			link.href = URL.createObjectURL(blob);
			const sheetPart = data.sheets.length > 1 ? `-${sheet.name}` : '';
			link.download = `${data.project.slug}-${shortSha(data.commit?.sha)}-schematic${sheetPart}.${format === 'jpeg' ? 'jpg' : 'png'}`;
			link.click();
			setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
			exportOpen = false;
		} catch (error) {
			exportError = error instanceof Error ? error.message : 'Export failed.';
		} finally {
			exporting = false;
		}
	}
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

		<div class="relative">
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
						<button
							class="viewer-btn border-l"
							class:!text-[var(--accent)]={exportOpen}
							onclick={() => (exportOpen = !exportOpen)}
							title="Export as image"
							aria-label="Export as image"
							aria-expanded={exportOpen}
						>
							<Icon name="camera" size={13} />
						</button>
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

		{#if exportOpen}
			<div
				class="absolute right-2 top-12 z-30 w-60 rounded-lg border bg-[var(--surface-1)] p-3 shadow-xl"
				role="dialog"
				aria-label="Export schematic as image"
			>
				<div class="mb-2 flex items-center justify-between">
					<h3 class="text-xs font-semibold">Export sheet as image</h3>
					<button class="viewer-btn !h-6 !w-6" onclick={() => (exportOpen = false)} aria-label="Close">
						<Icon name="x" size={12} />
					</button>
				</div>

				<label class="label !mb-1 !text-[0.625rem] uppercase" for="sch-dpi">Resolution</label>
				<select id="sch-dpi" class="select !py-1 text-xs" bind:value={dpi}>
					{#each [150, 300, 600] as option}
						{@const s = exportSize(option)}
						<option value={option}>{option} dpi — {s.width} × {s.height}</option>
					{/each}
				</select>
				{#if size.clamped}
					<p class="hint">Reduced to fit browser image limits.</p>
				{/if}

				<span class="label !mb-1 mt-2.5 !text-[0.625rem] uppercase">Look</span>
				<div class="flex gap-1">
					{#each [['shown', 'As shown'], ['light', 'Light'], ['dark', 'Dark']] as [value, label]}
						<button
							class="chip !py-1"
							class:!border-[var(--accent)]={look === value}
							class:!text-[var(--accent)]={look === value}
							onclick={() => (look = value as typeof look)}>{label}</button
						>
					{/each}
				</div>

				<span class="label !mb-1 mt-2.5 !text-[0.625rem] uppercase">Format</span>
				<div class="flex gap-1">
					{#each [['png', 'PNG'], ['jpeg', 'JPEG']] as [value, label]}
						<button
							class="chip !py-1"
							class:!border-[var(--accent)]={format === value}
							class:!text-[var(--accent)]={format === value}
							onclick={() => (format = value as typeof format)}>{label}</button
						>
					{/each}
				</div>

				{#if exportError}<p class="mt-2 text-[0.6875rem]" style:color="var(--err)">{exportError}</p>{/if}

				<button class="btn btn-primary btn-sm mt-3 w-full" onclick={exportSheet} disabled={exporting}>
					<Icon name="download" size={12} />
					{exporting ? 'Rendering…' : `Download ${size.width} × ${size.height}`}
				</button>
			</div>
		{/if}
		</div>

		<p class="mt-2 text-xs text-[var(--text-muted)]">
			Scroll to zoom, drag to pan, double-click to fit.
			<span class="kbd ml-1">F</span> fits, <span class="kbd">+</span>/<span class="kbd">−</span> zoom.
		</p>
	{/if}
</div>

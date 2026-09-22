<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';

	interface Props {
		/** Intrinsic size of the content, in any consistent unit. */
		contentWidth: number;
		contentHeight: number;
		children: Snippet;
		/** Drawn on top of the transformed content, in screen space. */
		overlay?: Snippet<[{ scale: number; tx: number; ty: number }]>;
		toolbar?: Snippet;
		background?: string;
		minScale?: number;
		maxScale?: number;
		class?: string;
	}

	let {
		contentWidth,
		contentHeight,
		children,
		overlay,
		toolbar,
		background = 'var(--viewer-bg)',
		minScale = 0.02,
		maxScale = 60,
		class: className = ''
	}: Props = $props();

	let viewport = $state<HTMLDivElement | null>(null);
	let scale = $state(1);
	let tx = $state(0);
	let ty = $state(0);
	let dragging = $state(false);
	let ready = $state(false);

	let pointerStart = { x: 0, y: 0, tx: 0, ty: 0 };

	function clamp(value: number) {
		return Math.min(Math.max(value, minScale), maxScale);
	}

	export function fit(padding = 0.94) {
		if (!viewport || !contentWidth || !contentHeight) return;
		const box = viewport.getBoundingClientRect();
		if (!box.width || !box.height) return;
		scale = clamp(Math.min(box.width / contentWidth, box.height / contentHeight) * padding);
		tx = (box.width - contentWidth * scale) / 2;
		ty = (box.height - contentHeight * scale) / 2;
		ready = true;
	}

	/** Zooms around a viewport-relative point so the cursor stays put. */
	function zoomAt(factor: number, clientX?: number, clientY?: number) {
		if (!viewport) return;
		const box = viewport.getBoundingClientRect();
		const px = clientX === undefined ? box.width / 2 : clientX - box.left;
		const py = clientY === undefined ? box.height / 2 : clientY - box.top;
		const next = clamp(scale * factor);
		const ratio = next / scale;
		tx = px - (px - tx) * ratio;
		ty = py - (py - ty) * ratio;
		scale = next;
	}

	function onWheel(event: WheelEvent) {
		event.preventDefault();
		// Trackpads report small deltaY per tick; normalise to a gentle factor.
		const factor = Math.exp(-event.deltaY * (event.deltaMode === 1 ? 0.05 : 0.0016));
		zoomAt(factor, event.clientX, event.clientY);
	}

	function onPointerDown(event: PointerEvent) {
		if (event.button !== 0 && event.button !== 1) return;
		dragging = true;
		pointerStart = { x: event.clientX, y: event.clientY, tx, ty };
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
	}

	function onPointerMove(event: PointerEvent) {
		if (!dragging) return;
		tx = pointerStart.tx + (event.clientX - pointerStart.x);
		ty = pointerStart.ty + (event.clientY - pointerStart.y);
	}

	function onPointerUp(event: PointerEvent) {
		dragging = false;
		try {
			(event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
		} catch {
			// Capture may already be gone if the pointer left the window.
		}
	}

	function onKeyDown(event: KeyboardEvent) {
		const step = event.shiftKey ? 80 : 30;
		const actions: Record<string, () => void> = {
			ArrowLeft: () => (tx += step),
			ArrowRight: () => (tx -= step),
			ArrowUp: () => (ty += step),
			ArrowDown: () => (ty -= step),
			'+': () => zoomAt(1.25),
			'=': () => zoomAt(1.25),
			'-': () => zoomAt(0.8),
			'0': () => fit(),
			f: () => fit()
		};
		const action = actions[event.key];
		if (action) {
			event.preventDefault();
			action();
		}
	}

	// Re-fit when the content changes size or the viewport is resized.
	$effect(() => {
		void contentWidth;
		void contentHeight;
		fit();
	});

	$effect(() => {
		if (!viewport) return;
		const observer = new ResizeObserver(() => {
			if (!ready) fit();
		});
		observer.observe(viewport);
		return () => observer.disconnect();
	});
</script>

<div class="relative flex flex-col overflow-hidden rounded-lg border {className}" style:background>
	<div class="pointer-events-none absolute right-2 top-2 z-20 flex items-start gap-2">
		{#if toolbar}<div class="pointer-events-auto">{@render toolbar()}</div>{/if}
		<div class="pointer-events-auto flex overflow-hidden rounded-md border bg-[var(--surface-1)]/92 backdrop-blur">
			<button class="viewer-btn" onclick={() => zoomAt(1.3)} title="Zoom in (+)" aria-label="Zoom in">
				<Icon name="plus" size={13} />
			</button>
			<button class="viewer-btn border-l" onclick={() => zoomAt(0.77)} title="Zoom out (−)" aria-label="Zoom out">
				<span class="block h-[13px] w-[13px] leading-[13px]">–</span>
			</button>
			<button class="viewer-btn border-l" onclick={() => fit()} title="Fit to view (F)" aria-label="Fit to view">
				<Icon name="search" size={13} />
			</button>
		</div>
	</div>

	<span class="mono pointer-events-none absolute bottom-2 right-2 z-20 rounded bg-black/45 px-1.5 py-0.5 text-[0.625rem] text-white/70">
		{Math.round(scale * 100)}%
	</span>

	<!--
		A pan/zoom surface is a custom widget: role="application" plus a label and
		full keyboard control (arrows pan, +/- zoom, F fits) is the accessible
		shape for it, but the linter classes the role as non-interactive.
	-->
	<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
	<div
		bind:this={viewport}
		class="relative flex-1 touch-none select-none overflow-hidden outline-none"
		class:cursor-grab={!dragging}
		class:cursor-grabbing={dragging}
		onwheel={onWheel}
		onpointerdown={onPointerDown}
		onpointermove={onPointerMove}
		onpointerup={onPointerUp}
		onpointercancel={onPointerUp}
		ondblclick={() => fit()}
		onkeydown={onKeyDown}
		role="application"
		aria-label="Pan and zoom viewer. Arrow keys pan, plus and minus zoom, F fits."
		tabindex="0"
	>
		<div
			class="absolute left-0 top-0 origin-top-left"
			style:transform="translate3d({tx}px, {ty}px, 0) scale({scale})"
			style:width="{contentWidth}px"
			style:height="{contentHeight}px"
			style:will-change="transform"
		>
			{@render children()}
		</div>
		{#if overlay}{@render overlay({ scale, tx, ty })}{/if}
	</div>
</div>

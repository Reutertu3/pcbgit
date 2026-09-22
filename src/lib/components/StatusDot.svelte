<script lang="ts">
	interface Props {
		status: string | null | undefined;
		label?: boolean;
	}
	let { status, label = false }: Props = $props();

	const config = $derived(
		(
			{
				success: { color: 'var(--ok)', text: 'Rendered', pulse: false },
				running: { color: 'var(--info)', text: 'Rendering', pulse: true },
				queued: { color: 'var(--warn)', text: 'Queued', pulse: true },
				failed: { color: 'var(--err)', text: 'Render failed', pulse: false },
				skipped: { color: 'var(--text-muted)', text: 'Skipped', pulse: false }
			} as Record<string, { color: string; text: string; pulse: boolean }>
		)[status ?? ''] ?? { color: 'var(--text-muted)', text: 'No render', pulse: false }
	);
</script>

<span class="inline-flex items-center gap-1.5 text-xs" title={config.text}>
	<span
		class="h-1.5 w-1.5 shrink-0 rounded-full"
		class:animate-pulse={config.pulse}
		style:background={config.color}
	></span>
	{#if label}<span style:color={config.color}>{config.text}</span>{/if}
</span>

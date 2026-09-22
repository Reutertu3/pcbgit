<script lang="ts">
	import { t } from '$lib/i18n/t';

	interface Props {
		status: string | null | undefined;
		label?: boolean;
	}
	let { status, label = false }: Props = $props();

	const config = $derived(
		(
			{
				success: { color: 'var(--ok)', text: t('status.success'), pulse: false },
				running: { color: 'var(--info)', text: t('status.running'), pulse: true },
				queued: { color: 'var(--warn)', text: t('status.queued'), pulse: true },
				failed: { color: 'var(--err)', text: t('status.failed'), pulse: false },
				skipped: { color: 'var(--text-muted)', text: t('status.skipped'), pulse: false }
			} as Record<string, { color: string; text: string; pulse: boolean }>
		)[status ?? ''] ?? { color: 'var(--text-muted)', text: t('status.none'), pulse: false }
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

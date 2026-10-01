<script lang="ts">
	import { formatBytes } from '$lib/format';
	import { t } from '$lib/i18n/t';

	interface Props {
		sent: number;
		total: number;
		/** Shown once everything is sent, while the server works on it. */
		after: string;
	}
	let { sent, total, after }: Props = $props();

	const percent = $derived(Math.floor((sent / Math.max(1, total)) * 100));
</script>

<div class="mt-3" role="status">
	<div class="h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]">
		<div class="h-full bg-[var(--accent)] transition-[width]" style:width="{percent}%"></div>
	</div>
	<p class="mt-1 text-xs text-[var(--text-muted)]">
		{sent >= total ? after : t('upload.progress', { sent: formatBytes(sent), total: formatBytes(total), percent })}
	</p>
</div>

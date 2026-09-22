<script lang="ts">
	import Icon from './Icon.svelte';
	import StatusDot from './StatusDot.svelte';
	import type { IconName } from '$lib/icons';
	import { t } from '$lib/i18n/t';

	interface Props {
		icon: IconName;
		title: string;
		message: string;
		status?: string | null;
		project?: { owner_username: string; slug: string };
	}
	let { icon, title, message, status, project }: Props = $props();

	const pending = $derived(status === 'queued' || status === 'running');
</script>

<div class="surface traces flex flex-col items-center gap-3 px-6 py-20 text-center">
	<Icon name={pending ? 'clock' : icon} size={30} class="text-[var(--text-muted)]" />
	<h2 class="text-base font-semibold">
		{pending ? t('empty.pendingTitle') : status === 'failed' ? t('empty.failedTitle') : title}
	</h2>
	<p class="max-w-md text-sm leading-relaxed text-[var(--text-secondary)]">
		{#if pending}
			{t('empty.pending')}
		{:else if status === 'failed'}
			{t('empty.failed')}
		{:else}
			{message}
		{/if}
	</p>
	{#if status}<StatusDot {status} label />{/if}
	{#if status === 'failed' && project}
		<a href="/{project.owner_username}/{project.slug}/history" class="btn btn-sm">{t('empty.viewLog')}</a>
	{/if}
</div>

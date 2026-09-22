<script lang="ts">
	import Icon from './Icon.svelte';
	import StatusDot from './StatusDot.svelte';
	import type { IconName } from '$lib/icons';

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
		{pending ? 'Render in progress' : status === 'failed' ? 'This version failed to render' : title}
	</h2>
	<p class="max-w-md text-sm leading-relaxed text-[var(--text-secondary)]">
		{#if pending}
			Come back in a moment — this page will have content once the render finishes.
		{:else if status === 'failed'}
			The render job did not complete. The log explains why.
		{:else}
			{message}
		{/if}
	</p>
	{#if status}<StatusDot {status} label />{/if}
	{#if status === 'failed' && project}
		<a href="/{project.owner_username}/{project.slug}/history" class="btn btn-sm">View render log</a>
	{/if}
</div>

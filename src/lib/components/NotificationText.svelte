<script lang="ts">
	import { relativeTime } from '$lib/format';
	import { tParts } from '$lib/i18n/t';
	import type { NotificationView } from '$lib/types';

	/** The sentence, excerpt and time of one notification; the bell and the message log share it. */
	let { item }: { item: NotificationView } = $props();

	const parts = $derived(
		item.kind === 'version'
			? tParts('notifications.version', { count: item.version_count })
			: item.kind === 'signup'
				? tParts(item.pending ? 'notifications.signupPending' : 'notifications.signup')
				: tParts(item.kind === 'reply' ? 'notifications.reply' : 'notifications.comment')
	);
</script>

<span class="block text-xs leading-snug text-[var(--text-secondary)]">
	{#each parts as part}
		{#if typeof part === 'string'}{part}{:else}<strong class="font-semibold text-[var(--text-primary)]"
				>{part.slot === 'actor' ? item.actor : item.project_name}</strong
			>{/if}
	{/each}
</span>
{#if item.kind === 'version'}
	<span class="excerpt mt-0.5 block text-xs text-[var(--text-muted)]">
		<span class="mono">{item.short_sha}</span>
		{item.excerpt}
	</span>
{:else if item.kind !== 'signup'}
	<span class="excerpt mt-0.5 block text-xs text-[var(--text-muted)]">“{item.excerpt}”</span>
{/if}
<span class="mt-0.5 block text-[0.6875rem] text-[var(--text-muted)]">{relativeTime(item.created_at)}</span>

<style>
	.excerpt {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
</style>

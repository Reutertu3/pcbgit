<script lang="ts">
	import Icon from './Icon.svelte';
	import { relativeTime } from '$lib/format';
	import { t } from '$lib/i18n/t';
	import type { ChangelogEntry } from '$lib/types';

	interface Props {
		commits: ChangelogEntry[];
		limit?: number;
		/** Total pending, when the list was capped by the host (50) or `limit`. */
		total?: number;
	}
	let { commits, limit = commits.length, total = commits.length }: Props = $props();

	const shown = $derived(commits.slice(0, limit));
</script>

<ol class="divide-y rounded-md border">
	{#each shown as commit (commit.sha)}
		<li class="flex items-baseline gap-2.5 px-3 py-2 text-xs">
			{#if commit.url}
				<a href={commit.url} class="mono shrink-0 text-[var(--accent)] hover:underline" target="_blank" rel="noopener">{commit.short}</a>
			{:else}
				<span class="mono shrink-0 text-[var(--text-muted)]">{commit.short}</span>
			{/if}
			<span class="min-w-0 flex-1 text-[var(--text-primary)]">{commit.subject}</span>
			<span class="shrink-0 text-[0.6875rem] text-[var(--text-muted)]" title={new Date(commit.date).toLocaleString()}>
				{commit.author} · {relativeTime(commit.date)}
			</span>
		</li>
	{/each}
	{#if total > shown.length}
		<li class="flex items-center gap-1.5 px-3 py-2 text-[0.6875rem] text-[var(--text-muted)]">
			<Icon name="history" size={11} /> {t('changelog.more', { count: total - shown.length })}
		</li>
	{/if}
</ol>

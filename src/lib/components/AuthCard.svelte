<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		title: string;
		subtitle?: string;
		children: Snippet;
		footer?: Snippet;
	}
	let { title, subtitle, children, footer }: Props = $props();
</script>

<div class="mx-auto flex min-h-[calc(100vh-14rem)] max-w-md flex-col justify-center px-4 py-10">
	<div class="surface p-6 sm:p-7">
		<h1 class="text-xl font-semibold tracking-tight">{title}</h1>
		{#if subtitle}<p class="mt-1 text-sm text-[var(--text-secondary)]">{subtitle}</p>{/if}
		<div class="mt-5">{@render children()}</div>
	</div>
	{#if footer}
		<p class="mt-4 text-center text-sm text-[var(--text-secondary)]">{@render footer()}</p>
	{/if}
</div>

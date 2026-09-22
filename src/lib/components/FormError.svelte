<script lang="ts">
	import Icon from './Icon.svelte';
	interface Props {
		message?: string | null;
		kind?: 'error' | 'success' | 'info';
	}
	let { message, kind = 'error' }: Props = $props();

	const color = $derived(kind === 'error' ? 'var(--err)' : kind === 'success' ? 'var(--ok)' : 'var(--info)');
</script>

{#if message}
	<div
		class="mb-4 flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm"
		style:border-color="color-mix(in srgb, {color} 40%, transparent)"
		style:background="color-mix(in srgb, {color} 10%, transparent)"
		style:color
		role={kind === 'error' ? 'alert' : 'status'}
	>
		<Icon name={kind === 'error' ? 'alert' : kind === 'success' ? 'check' : 'info'} size={15} class="mt-0.5 shrink-0" />
		<span class="leading-relaxed">{message}</span>
	</div>
{/if}

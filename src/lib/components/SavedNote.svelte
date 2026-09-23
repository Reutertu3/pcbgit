<script lang="ts">
	import { fade } from 'svelte/transition';
	import Icon from './Icon.svelte';

	interface Props {
		/** The confirmation to show next to a save button; nothing when null. */
		message?: string | null;
		/** Changes with every submit (the `form` result), so saving again shows the note again. */
		token?: unknown;
	}
	let { message, token }: Props = $props();

	// Shown from the first render, so a submit without JavaScript still confirms.
	let visible = $derived(Boolean(message));

	$effect(() => {
		void token;
		if (!message) return;
		visible = true;
		const timer = setTimeout(() => (visible = false), 4000);
		return () => clearTimeout(timer);
	});
</script>

{#if visible && message}
	<span
		class="inline-flex items-center gap-1.5 text-sm"
		style:color="var(--ok)"
		role="status"
		in:fade={{ duration: 300 }}
		out:fade={{ duration: 1600 }}
	>
		<Icon name="check" size={14} />
		{message}
	</span>
{/if}

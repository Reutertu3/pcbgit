<script lang="ts">
	interface Props {
		tag: { slug: string; name: string; color: string };
		href?: string;
		active?: boolean;
		count?: number;
		title?: string;
	}
	let { tag, href, active = false, count, title }: Props = $props();

	// Old rows may still carry a non-hex placeholder until the boot backfill runs.
	const color = $derived(/^#[0-9a-f]{6}$/i.test(tag.color) ? tag.color : '#8a9a8b');
</script>

<svelte:element
	this={href ? 'a' : 'span'}
	{href}
	{title}
	class="tag-chip"
	class:active
	style:--tag={color}
>
	<span class="dot" aria-hidden="true"></span>
	{tag.name}
	{#if count !== undefined}<span class="count">{count}</span>{/if}
</svelte:element>

<style>
	.tag-chip {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.1rem 0.5rem;
		border-radius: 999px;
		font-size: 0.6875rem;
		font-weight: 500;
		white-space: nowrap;
		border: 1px solid color-mix(in srgb, var(--tag) 40%, transparent);
		background: color-mix(in srgb, var(--tag) 14%, transparent);
		/* Pull the text toward the theme's foreground so it stays legible on light and dark. */
		color: color-mix(in srgb, var(--tag) 60%, var(--text-primary));
		transition: border-color 120ms ease, background 120ms ease;
	}
	a.tag-chip:hover {
		border-color: var(--tag);
	}
	.tag-chip.active {
		border-color: var(--tag);
		background: color-mix(in srgb, var(--tag) 30%, transparent);
		box-shadow: 0 0 0 1px var(--tag);
	}
	.dot {
		width: 0.45rem;
		height: 0.45rem;
		border-radius: 999px;
		background: var(--tag);
	}
	.count {
		color: var(--text-muted);
	}
</style>

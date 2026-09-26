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
		/* Neutral like every other chip: the dot carries the tag's colour, so a row
		   of tags does not outshout the board it describes. */
		border: 1px solid var(--border-subtle);
		background: var(--surface-2);
		color: var(--text-secondary);
		transition: border-color 120ms ease, background 120ms ease, color 120ms ease;
	}
	a.tag-chip:hover {
		border-color: color-mix(in srgb, var(--tag) 60%, var(--border-strong));
		color: var(--text-primary);
	}
	/* The selected filter is the one place the colour spreads to the chip. */
	.tag-chip.active {
		border-color: var(--tag);
		background: color-mix(in srgb, var(--tag) 18%, var(--surface-2));
		color: var(--text-primary);
	}
	.dot {
		width: 0.45rem;
		height: 0.45rem;
		border-radius: 999px;
		background: var(--tag);
	}
	.count {
		color: var(--text-muted);
		font-variant-numeric: tabular-nums;
	}
</style>

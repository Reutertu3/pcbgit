<script lang="ts">
	interface PickerTag {
		slug: string;
		name: string;
		color: string;
		category: string;
	}

	interface Props {
		tags: PickerTag[];
		selected: string[];
		name?: string;
	}
	let { tags, selected, name = 'tags' }: Props = $props();

	const LABELS: Record<string, string> = {
		component: 'Components',
		interface: 'Interfaces',
		domain: 'Application',
		process: 'Fabrication',
		general: 'Other'
	};

	// Seeded from the prop; after that the checkboxes are the source of truth.
	let chosen = $state<string[]>([]);
	$effect.pre(() => {
		chosen = [...selected];
	});

	const groups = $derived(
		Object.keys(LABELS)
			.map((category) => ({ category, tags: tags.filter((tag) => tag.category === category) }))
			.filter((group) => group.tags.length)
	);
</script>

{#if !tags.length}
	<p class="hint">No tags exist yet. An administrator can create them in the admin panel.</p>
{:else}
	<div class="flex flex-col gap-2.5">
		{#each groups as group}
			<fieldset>
				<legend class="mb-1 text-[0.625rem] uppercase tracking-wide text-[var(--text-muted)]">
					{LABELS[group.category]}
				</legend>
				<div class="flex flex-wrap gap-1.5">
					{#each group.tags as tag}
						{@const on = chosen.includes(tag.slug)}
						<label class="pick" class:on style:--tag={tag.color}>
							<input type="checkbox" {name} value={tag.slug} bind:group={chosen} class="sr-only" />
							<span class="dot" aria-hidden="true"></span>
							{tag.name}
						</label>
					{/each}
				</div>
			</fieldset>
		{/each}
	</div>
	<p class="hint">{chosen.length} selected. Tags are managed by administrators.</p>
{/if}

<style>
	.pick {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.25rem 0.6rem;
		border-radius: 999px;
		font-size: 0.75rem;
		cursor: pointer;
		user-select: none;
		border: 1px solid var(--border-strong);
		color: var(--text-secondary);
		transition: all 120ms ease;
	}
	.pick:hover {
		border-color: var(--tag);
	}
	.pick:focus-within {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.pick.on {
		border-color: var(--tag);
		background: color-mix(in srgb, var(--tag) 22%, transparent);
		color: color-mix(in srgb, var(--tag) 55%, var(--text-primary));
	}
	.dot {
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 999px;
		border: 1.5px solid var(--tag);
	}
	.pick.on .dot {
		background: var(--tag);
	}
</style>

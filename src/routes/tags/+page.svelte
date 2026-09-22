<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';

	let { data } = $props();

	const LABELS: Record<string, string> = {
		component: 'Components',
		interface: 'Interfaces',
		domain: 'Application',
		process: 'Fabrication',
		general: 'Other'
	};

	/** Scale the chip with usage so the popular tags read first. */
	const max = $derived(
		Math.max(1, ...data.groups.flatMap((group) => group.tags.map((tag) => tag.project_count)))
	);
</script>

<svelte:head><title>Tags · {data.site.name}</title></svelte:head>

<div class="mx-auto max-w-4xl px-4 py-6">
	<h1 class="text-xl font-semibold tracking-tight">Tags</h1>
	<p class="mt-1 text-sm text-[var(--text-secondary)]">
		Tags are created as designers use them. Click one to filter the board list.
	</p>

	{#each data.groups as group}
		<section class="mt-6">
			<h2 class="mb-2.5 flex items-center gap-1.5 text-sm font-semibold">
				<Icon name="tag" size={14} class="text-[var(--text-muted)]" />
				{LABELS[group.category] ?? group.category}
				<span class="chip">{group.tags.length}</span>
			</h2>
			<div class="flex flex-wrap gap-2">
				{#each group.tags as tag}
					<a
						href="/?tag={tag.slug}"
						class="chip !py-1.5 transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
						class:opacity-55={tag.project_count === 0}
						style:font-size="{0.6875 + (tag.project_count / max) * 0.19}rem"
					>
						{tag.name}
						<span class="text-[var(--text-muted)]">{tag.project_count}</span>
					</a>
				{/each}
			</div>
		</section>
	{/each}

	{#if !data.groups.length}
		<p class="surface mt-6 px-6 py-16 text-center text-sm text-[var(--text-muted)]">No tags yet.</p>
	{/if}
</div>

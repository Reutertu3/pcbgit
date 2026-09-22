<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import TagChip from '$lib/components/TagChip.svelte';

	let { data } = $props();

	const LABELS: Record<string, string> = {
		component: 'Components',
		interface: 'Interfaces',
		domain: 'Application',
		process: 'Fabrication',
		general: 'Other'
	};

</script>

<svelte:head><title>Tags · {data.site.name}</title></svelte:head>

<div class="mx-auto max-w-4xl px-4 py-6">
	<h1 class="text-xl font-semibold tracking-tight">Tags</h1>
	<p class="mt-1 text-sm text-[var(--text-secondary)]">
		Tags are curated by the administrators. Click one to filter the board list.
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
					<span
						class:opacity-55={tag.project_count === 0}
						title={tag.description || undefined}
					>
						<TagChip {tag} href="/?tag={tag.slug}" count={tag.project_count} />
					</span>
				{/each}
			</div>
		</section>
	{/each}

	{#if !data.groups.length}
		<p class="surface mt-6 px-6 py-16 text-center text-sm text-[var(--text-muted)]">No tags yet.</p>
	{/if}
</div>

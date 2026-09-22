<script lang="ts">
	import { enhance } from '$app/forms';
	import Icon from '$lib/components/Icon.svelte';
	import FormError from '$lib/components/FormError.svelte';

	let { data, form } = $props();

	let editing = $state<string | null>(null);
</script>

<svelte:head><title>Tags · Admin · {data.site.name}</title></svelte:head>

<div class="mb-4 flex flex-wrap items-center justify-between gap-2">
	<h2 class="text-lg font-semibold tracking-tight">Tags</h2>
	<form method="POST" action="?/prune" use:enhance>
		<button class="btn btn-sm" type="submit" title="Delete tags that no board uses">
			<Icon name="trash" size={13} /> Prune unused
		</button>
	</form>
</div>

{#if form?.message}<FormError message={form.message} kind="success" />{/if}
{#if form?.error}<FormError message={form.error} />{/if}

<section class="surface mb-4 p-4">
	<h3 class="mb-3 text-sm font-semibold">Create a tag</h3>
	<form method="POST" action="?/create" use:enhance class="flex flex-wrap items-end gap-2">
		<div class="min-w-40 flex-1">
			<label class="label" for="tag-name">Name</label>
			<input class="input !py-1.5" id="tag-name" name="name" maxlength="40" required />
		</div>
		<div>
			<label class="label" for="tag-category">Category</label>
			<select class="select !w-auto !py-1.5" id="tag-category" name="category">
				{#each data.categories as category}<option value={category}>{category}</option>{/each}
			</select>
		</div>
		<div class="min-w-48 flex-[2]">
			<label class="label" for="tag-description">Description</label>
			<input class="input !py-1.5" id="tag-description" name="description" maxlength="200" />
		</div>
		<button class="btn btn-primary btn-sm" type="submit"><Icon name="plus" size={13} /> Add</button>
	</form>
</section>

<div class="surface overflow-x-auto">
	<table class="w-full text-left text-[0.8125rem]">
		<thead class="bg-s2 text-xs">
			<tr>
				<th class="px-3 py-2 font-semibold">Tag</th>
				<th class="px-3 py-2 font-semibold">Category</th>
				<th class="px-3 py-2 font-semibold">Boards</th>
				<th class="px-3 py-2 font-semibold">Description</th>
				<th class="px-3 py-2"></th>
			</tr>
		</thead>
		<tbody>
			{#each data.tags as tag (tag.id)}
				{#if editing === tag.id}
					<tr class="border-t bg-s2">
						<td colspan="5" class="px-3 py-2.5">
							<form method="POST" action="?/update" use:enhance={() => async ({ update }) => {
								await update();
								editing = null;
							}} class="flex flex-wrap items-end gap-2">
								<input type="hidden" name="id" value={tag.id} />
								<div class="min-w-32 flex-1">
									<label class="label" for="edit-name-{tag.id}">Name</label>
									<input class="input !py-1.5" id="edit-name-{tag.id}" name="name" value={tag.name} maxlength="40" required />
								</div>
								<div>
									<label class="label" for="edit-cat-{tag.id}">Category</label>
									<select class="select !w-auto !py-1.5" id="edit-cat-{tag.id}" name="category" value={tag.category}>
										{#each data.categories as category}<option value={category}>{category}</option>{/each}
									</select>
								</div>
								<div class="min-w-48 flex-[2]">
									<label class="label" for="edit-desc-{tag.id}">Description</label>
									<input class="input !py-1.5" id="edit-desc-{tag.id}" name="description" value={tag.description} maxlength="200" />
								</div>
								<button class="btn btn-primary btn-sm" type="submit">Save</button>
								<button class="btn btn-ghost btn-sm" type="button" onclick={() => (editing = null)}>Cancel</button>
							</form>
						</td>
					</tr>
				{:else}
					<tr class="border-t">
						<td class="px-3 py-2">
							<a href="/?tag={tag.slug}" class="hover:text-[var(--accent)]">{tag.name}</a>
							<span class="mono block text-[0.6875rem] text-[var(--text-muted)]">{tag.slug}</span>
						</td>
						<td class="px-3 py-2"><span class="chip">{tag.category}</span></td>
						<td class="px-3 py-2 tabular-nums">{tag.project_count}</td>
						<td class="max-w-sm truncate px-3 py-2 text-xs text-[var(--text-secondary)]">{tag.description}</td>
						<td class="px-3 py-2">
							<div class="flex justify-end gap-1">
								<button class="btn btn-sm" onclick={() => (editing = tag.id)} title="Edit tag">
									<Icon name="settings" size={12} />
								</button>
								<form method="POST" action="?/delete" use:enhance>
									<input type="hidden" name="id" value={tag.id} />
									<button class="btn btn-danger btn-sm" type="submit" title="Delete tag">
										<Icon name="trash" size={12} />
									</button>
								</form>
							</div>
						</td>
					</tr>
				{/if}
			{/each}
		</tbody>
	</table>
	{#if !data.tags.length}
		<p class="px-4 py-10 text-center text-sm text-[var(--text-muted)]">No tags yet.</p>
	{/if}
</div>

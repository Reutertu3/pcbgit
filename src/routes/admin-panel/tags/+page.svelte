<script lang="ts">
	import { enhance } from '$app/forms';
	import { keepValues } from '$lib/forms';
	import Icon from '$lib/components/Icon.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import TagChip from '$lib/components/TagChip.svelte';
	import { t } from '$lib/i18n/t';
	import { categoryLabel } from '$lib/tagcategory';

	let { data, form } = $props();

	const categoryName = (id: string) => categoryLabel(id, data.categories.find((c) => c.id === id)?.name);

	/** Quick picks; the colour input still allows any colour. */
	const PRESETS = [
		'#9cb080', '#618764', '#2b5748', '#6ba4e8', '#82b4c8', '#c4829a',
		'#e2b862', '#fe8019', '#e57f72', '#b39ddb', '#8a9a8b', '#d5c4a1'
	];

	let editing = $state<string | null>(null);
	let newName = $state('');
	let newCategory = $state('component');
	let newColor = $state('#6ba4e8');
	let colorTouched = $state(false);
	let editColor = $state('#000000');

	// Until the admin picks a colour, follow the category's default.
	$effect(() => {
		if (!colorTouched) newColor = data.categories.find((c) => c.id === newCategory)?.color ?? '#8a9a8b';
	});

	function startEdit(tag: { id: string; color: string }) {
		editing = tag.id;
		editColor = /^#[0-9a-f]{6}$/i.test(tag.color) ? tag.color : '#8a9a8b';
	}
</script>

<svelte:head><title>{t('nav.tags')} · {t('admin.title')} · {data.site.name}</title></svelte:head>

<div class="mb-4 flex flex-wrap items-center justify-between gap-2">
	<div>
		<h2 class="text-lg font-semibold tracking-tight">{t('nav.tags')}</h2>
		<p class="text-xs text-[var(--text-muted)]">{t('adminTags.intro')}</p>
	</div>
	<form method="POST" action="?/prune" use:enhance>
		<button class="btn btn-sm" type="submit" title={t('adminTags.pruneTitle')}>
			<Icon name="trash" size={13} /> {t('adminTags.prune')}
		</button>
	</form>
</div>

{#if form?.message}<FormError message={form.message} kind="success" />{/if}
{#if form?.error}<FormError message={form.error} />{/if}

{#snippet swatches(current: string, pick: (color: string) => void)}
	<div class="flex flex-wrap gap-1">
		{#each PRESETS as color}
			<button
				type="button"
				class="h-5 w-5 rounded-full border-2 transition-transform hover:scale-110"
				style:background={color}
				style:border-color={current === color ? 'var(--text-primary)' : 'transparent'}
				onclick={() => pick(color)}
				title={color}
				aria-label={t('adminTags.useColour', { color })}
			></button>
		{/each}
	</div>
{/snippet}

<section class="surface mb-4 p-4">
	<h3 class="mb-1 text-sm font-semibold">{t('adminTags.categories')}</h3>
	<p class="mb-3 text-xs text-[var(--text-muted)]">{t('adminTags.categoriesHint')}</p>
	<ul class="mb-3 divide-y rounded-lg border">
		{#each data.categories as category, index (category.id)}
			<li class="flex flex-wrap items-center gap-2 px-3 py-2">
				<form method="POST" action="?/updateCategory" use:enhance={keepValues} class="flex flex-1 flex-wrap items-center gap-2">
					<input type="hidden" name="id" value={category.id} />
					<input type="color" name="color" value={category.color} class="h-7 w-9 cursor-pointer rounded border bg-transparent" aria-label={t('adminTags.colour')} />
					<input
						class="input !w-auto min-w-40 flex-1 !py-1"
						name="name"
						value={category.name}
						placeholder={categoryLabel(category.id)}
						maxlength="40"
						aria-label={t('boardForm.name')}
					/>
					<span class="text-xs text-[var(--text-muted)]">{t('adminTags.categoryTags', { count: category.tag_count })}</span>
					<button class="btn btn-sm" type="submit">{t('common.save')}</button>
				</form>
				<div class="flex gap-1">
					{#each [['up', index === 0, 'chevronUp'], ['down', index === data.categories.length - 1, 'chevronDown']] as const as [direction, edge, icon]}
						<form method="POST" action="?/moveCategory" use:enhance>
							<input type="hidden" name="id" value={category.id} />
							<input type="hidden" name="direction" value={direction} />
							<button class="btn btn-sm" type="submit" disabled={edge} aria-label={t(direction === 'up' ? 'adminTags.moveUp' : 'adminTags.moveDown')}>
								<Icon name={icon} size={12} />
							</button>
						</form>
					{/each}
					{#if category.id !== data.fallbackCategory}
						<form
							method="POST"
							action="?/deleteCategory"
							use:enhance={({ cancel }) => {
								if (category.tag_count && !confirm(t('adminTags.confirmDeleteCategory', { name: categoryLabel(category.id, category.name), count: category.tag_count, fallback: categoryName(data.fallbackCategory) }))) cancel();
							}}
						>
							<input type="hidden" name="id" value={category.id} />
							<button class="btn btn-danger btn-sm" type="submit" aria-label={t('adminTags.deleteCategory')}>
								<Icon name="trash" size={12} />
							</button>
						</form>
					{/if}
				</div>
			</li>
		{/each}
	</ul>
	<form method="POST" action="?/createCategory" use:enhance class="flex flex-wrap items-center gap-2">
		<input type="color" name="color" value="#8a9a8b" class="h-7 w-9 cursor-pointer rounded border bg-transparent" aria-label={t('adminTags.colour')} />
		<input class="input !w-auto min-w-40 flex-1 !py-1.5" name="name" maxlength="40" placeholder={t('adminTags.newCategory')} required aria-label={t('boardForm.name')} />
		<button class="btn btn-sm" type="submit"><Icon name="plus" size={13} /> {t('adminTags.createCategory')}</button>
	</form>
</section>

<section class="surface mb-4 p-4">
	<h3 class="mb-3 text-sm font-semibold">{t('adminTags.create')}</h3>
	<form
		method="POST"
		action="?/create"
		use:enhance={() => async ({ result, update }) => {
			await update();
			if (result.type === 'success') {
				newName = '';
				colorTouched = false;
			}
		}}
		class="flex flex-col gap-3"
	>
		<div class="flex flex-wrap items-end gap-2">
			<div class="min-w-40 flex-1">
				<label class="label" for="tag-name">{t('boardForm.name')}</label>
				<input class="input !py-1.5" id="tag-name" name="name" maxlength="40" bind:value={newName} required />
			</div>
			<div>
				<label class="label" for="tag-category">{t('adminTags.category')}</label>
				<select class="select !w-auto !py-1.5" id="tag-category" name="category" bind:value={newCategory}>
					{#each data.categories as category}<option value={category.id}>{categoryLabel(category.id, category.name)}</option>{/each}
				</select>
			</div>
			<div class="min-w-48 flex-[2]">
				<label class="label" for="tag-description">{t('boardForm.description')}</label>
				<input class="input !py-1.5" id="tag-description" name="description" maxlength="200" />
			</div>
		</div>
		<div class="flex flex-wrap items-center gap-3">
			<label class="label !mb-0" for="tag-color">{t('adminTags.colour')}</label>
			<input
				id="tag-color"
				type="color"
				name="color"
				class="h-7 w-10 cursor-pointer rounded border bg-transparent"
				bind:value={newColor}
				oninput={() => (colorTouched = true)}
			/>
			{@render swatches(newColor, (color) => {
				newColor = color;
				colorTouched = true;
			})}
			<span class="ml-auto flex items-center gap-2 text-xs text-[var(--text-muted)]">
				{t('adminTags.preview')} <TagChip tag={{ slug: '', name: newName || t('adminTags.newTag'), color: newColor }} />
			</span>
		</div>
		<div><button class="btn btn-primary btn-sm" type="submit"><Icon name="plus" size={13} /> {t('adminTags.createButton')}</button></div>
	</form>
</section>

<div class="surface overflow-x-auto">
	<table class="w-full text-left text-[0.8125rem]">
		<thead class="bg-s2 text-xs">
			<tr>
				<th class="px-3 py-2 font-semibold">{t('adminTags.tag')}</th>
				<th class="px-3 py-2 font-semibold">{t('adminTags.category')}</th>
				<th class="px-3 py-2 font-semibold">{t('admin.nav.boards')}</th>
				<th class="px-3 py-2 font-semibold">{t('boardForm.description')}</th>
				<th class="px-3 py-2"></th>
			</tr>
		</thead>
		<tbody>
			{#each data.tags as tag (tag.id)}
				{#if editing === tag.id}
					<tr class="border-t bg-s2">
						<td colspan="5" class="px-3 py-3">
							<form
								method="POST"
								action="?/update"
								use:enhance={() => async ({ result, update }) => {
									await update();
									if (result.type === 'success') editing = null;
								}}
								class="flex flex-col gap-3"
							>
								<input type="hidden" name="id" value={tag.id} />
								<div class="flex flex-wrap items-end gap-2">
									<div class="min-w-32 flex-1">
										<label class="label" for="edit-name-{tag.id}">{t('boardForm.name')}</label>
										<input class="input !py-1.5" id="edit-name-{tag.id}" name="name" value={tag.name} maxlength="40" required />
									</div>
									<div>
										<label class="label" for="edit-cat-{tag.id}">{t('adminTags.category')}</label>
										<select class="select !w-auto !py-1.5" id="edit-cat-{tag.id}" name="category" value={tag.category}>
											{#each data.categories as category}<option value={category.id}>{categoryLabel(category.id, category.name)}</option>{/each}
										</select>
									</div>
									<div class="min-w-48 flex-[2]">
										<label class="label" for="edit-desc-{tag.id}">{t('boardForm.description')}</label>
										<input class="input !py-1.5" id="edit-desc-{tag.id}" name="description" value={tag.description} maxlength="200" />
									</div>
								</div>
								<div class="flex flex-wrap items-center gap-3">
									<label class="label !mb-0" for="edit-color-{tag.id}">{t('adminTags.colour')}</label>
									<input
										id="edit-color-{tag.id}"
										type="color"
										name="color"
										class="h-7 w-10 cursor-pointer rounded border bg-transparent"
										bind:value={editColor}
									/>
									{@render swatches(editColor, (color) => (editColor = color))}
									<span class="ml-auto"><TagChip tag={{ ...tag, color: editColor }} /></span>
								</div>
								<div class="flex gap-2">
									<button class="btn btn-primary btn-sm" type="submit">{t('common.save')}</button>
									<button class="btn btn-ghost btn-sm" type="button" onclick={() => (editing = null)}>{t('common.cancel')}</button>
								</div>
							</form>
						</td>
					</tr>
				{:else}
					<tr class="border-t">
						<td class="px-3 py-2">
							<TagChip {tag} href="/?tag={tag.slug}" />
							<span class="mono block pt-0.5 text-[0.6875rem] text-[var(--text-muted)]">{tag.slug} · {tag.color}</span>
						</td>
						<td class="px-3 py-2"><span class="chip">{categoryName(tag.category)}</span></td>
						<td class="px-3 py-2 tabular-nums">{tag.project_count}</td>
						<td class="max-w-sm truncate px-3 py-2 text-xs text-[var(--text-secondary)]">{tag.description}</td>
						<td class="px-3 py-2">
							<div class="flex justify-end gap-1">
								<button class="btn btn-sm" onclick={() => startEdit(tag)} title={t('adminTags.edit')}>
									<Icon name="settings" size={12} />
								</button>
								<form
									method="POST"
									action="?/delete"
									use:enhance={({ cancel }) => {
										if (tag.project_count && !confirm(t('adminTags.confirmDelete', { name: tag.name, count: tag.project_count }))) cancel();
									}}
								>
									<input type="hidden" name="id" value={tag.id} />
									<button class="btn btn-danger btn-sm" type="submit" title={t('adminTags.delete')}>
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
		<p class="px-4 py-10 text-center text-sm text-[var(--text-muted)]">{t('tags.none')}</p>
	{/if}
</div>

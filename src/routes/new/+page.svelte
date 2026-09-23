<script lang="ts">
	import { enhance } from '$app/forms';
	import Icon from '$lib/components/Icon.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import TagPicker from '$lib/components/TagPicker.svelte';
	import { formatBytes } from '$lib/format';
	import { t, tParts } from '$lib/i18n/t';
	import LicenseSummary from '$lib/components/LicenseSummary.svelte';
	import { licenseName } from '$lib/licenses';

	let { data, form } = $props();

	/** Kept across a failed submit, and explained below the select as it changes. */
	let license = $derived(form?.license ?? '');

	let typedName = $state<string | null>(null);
	let typedSlug = $state<string | null>(null);
	let file = $state<File | null>(null);
	let dragging = $state(false);
	let submitting = $state(false);

	// A failed submit re-renders with `form`; typed values win once the user edits.
	const name = $derived(typedName ?? form?.name ?? '');

	/** Mirror the name into the slug until the user edits the slug directly. */
	const autoSlug = $derived(
		name
			.toLowerCase()
			.replace(/[^a-z0-9._-]+/g, '-')
			.replace(/^-+|-+$/g, '')
			.slice(0, 64)
	);
	const effectiveSlug = $derived(typedSlug ?? form?.slug ?? autoSlug);

	function pickFile(list: FileList | null) {
		const picked = list?.[0] ?? null;
		if (picked && !/\.zip$/i.test(picked.name)) {
			file = null;
			return;
		}
		file = picked;
	}
</script>

<svelte:head><title>{t('nav.newBoard')} · {data.site.name}</title></svelte:head>

<div class="mx-auto max-w-2xl px-4 py-8">
	<h1 class="text-xl font-semibold tracking-tight">{t('newBoard.title')}</h1>
	<p class="mt-1 text-sm text-[var(--text-secondary)]">
		{t('newBoard.intro')}
	</p>

	<form
		class="mt-6"
		method="POST"
		enctype="multipart/form-data"
		use:enhance={() => {
			submitting = true;
			return async ({ update }) => {
				await update({ reset: false });
				submitting = false;
			};
		}}
	>
		<FormError message={form?.error} />

		<div class="surface p-5">
			<div class="mb-4">
				<label class="label" for="name">{t('newBoard.name')}</label>
				<input
					class="input"
					id="name"
					name="name"
					value={name}
					oninput={(event) => (typedName = event.currentTarget.value)}
					placeholder={t('newBoard.namePlaceholder')}
					required
				/>
			</div>

			<div class="mb-4">
				<label class="label" for="slug">{t('newBoard.url')}</label>
				<div class="flex items-center gap-1.5">
					<span class="mono shrink-0 text-sm text-[var(--text-muted)]">/{data.user?.username}/</span>
					<input
						class="input mono"
						id="slug"
						name="slug"
						value={effectiveSlug}
						oninput={(event) => (typedSlug = event.currentTarget.value)}
						required
					/>
				</div>
			</div>

			<div class="mb-4">
				<label class="label" for="description">{t('boardForm.description')}</label>
				<textarea
					class="textarea"
					id="description"
					name="description"
					maxlength="500"
					placeholder={t('newBoard.descriptionPlaceholder')}
					>{form?.description ?? ''}</textarea
				>
			</div>

			<div class="mb-4 grid gap-4 sm:grid-cols-2">
				<div>
					<label class="label" for="license">{t('boardForm.license')}</label>
					<select class="select" id="license" name="license" bind:value={license}>
						<option value="">{t('boardForm.noLicense')}</option>
						{#each data.licenses as id}
							<option value={id}>{licenseName(id, t('license.proprietary'))}</option>
						{/each}
					</select>
					<div class="mt-2"><LicenseSummary {license} /></div>
				</div>
				<div>
					<label class="label" for="visibility">{t('boardForm.visibility')}</label>
					<select class="select" id="visibility" name="visibility">
						<option value="public" selected={form?.visibility !== 'private'}>{t('newBoard.public')}</option>
						<option value="private" selected={form?.visibility === 'private'}>{t('newBoard.private')}</option>
					</select>
				</div>
			</div>

			<div class="mb-4">
				<span class="label">{t('nav.tags')}</span>
				<TagPicker tags={data.allTags} selected={form?.tags ?? []} />
			</div>

			<div>
				<label class="label" for="source_url">{t('newBoard.source')} <span class="font-normal text-[var(--text-muted)]">({t('common.optional')})</span></label>
				<input class="input" id="source_url" name="source_url" type="url" value={form?.source_url ?? ''} placeholder={t('newBoard.sourcePlaceholder')} />
			</div>
		</div>

		<!-- Upload -->
		<div class="surface mt-4 p-5">
			<h2 class="mb-1 text-sm font-semibold">{t('newBoard.files')}</h2>
			<p class="mb-3 text-xs text-[var(--text-secondary)]">
				{t('newBoard.filesHint')}
			</p>

			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<label
				class="traces flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center transition-colors"
				class:!border-[var(--accent)]={dragging}
				class:bg-[var(--accent-soft)]={dragging}
				ondragover={(event) => {
					event.preventDefault();
					dragging = true;
				}}
				ondragleave={() => (dragging = false)}
				ondrop={(event) => {
					event.preventDefault();
					dragging = false;
					pickFile(event.dataTransfer?.files ?? null);
				}}
			>
				<Icon name="upload" size={22} class="text-[var(--text-muted)]" />
				{#if file}
					<span class="mono text-sm">{file.name}</span>
					<span class="text-xs text-[var(--text-muted)]">{formatBytes(file.size)}</span>
				{:else}
					<span class="text-sm">{#each tParts('newBoard.drop') as part}{#if typeof part === 'string'}{part}{:else}<span class="mono">.zip</span>{/if}{/each}</span>
					<span class="text-xs text-[var(--text-muted)]">{t('newBoard.limit')}</span>
				{/if}
				<input
					class="sr-only"
					type="file"
					name="archive"
					accept=".zip,application/zip"
					onchange={(event) => pickFile(event.currentTarget.files)}
				/>
			</label>
		</div>

		<div class="mt-5 flex items-center gap-3">
			<button class="btn btn-primary" type="submit" disabled={submitting}>
				{submitting ? t('newBoard.creating') : t('newBoard.create')}
			</button>
			<a href="/" class="btn btn-ghost">{t('common.cancel')}</a>
		</div>
	</form>
</div>

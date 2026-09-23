<script lang="ts">
	import { enhance } from '$app/forms';
	import { keepValues } from '$lib/forms';
	import Icon from '$lib/components/Icon.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import SavedNote from '$lib/components/SavedNote.svelte';
	import CloneBox from '$lib/components/CloneBox.svelte';
	import TagPicker from '$lib/components/TagPicker.svelte';
	import { formatBytes } from '$lib/format';
	import { t, tParts } from '$lib/i18n/t';
	import LicenseSummary from '$lib/components/LicenseSummary.svelte';
	import { licenseName } from '$lib/licenses';

	let { data, form } = $props();

	let file = $state<File | null>(null);
	let confirmText = $state('');
	let uploading = $state(false);

	// Follows the board shown (the page is reused between boards), yet the select can change it.
	let license = $derived(data.project.license);
	// A license no longer offered stays selectable, so saving other settings keeps it.
	const licenseOptions = $derived(
		data.project.license && !data.licenses.includes(data.project.license)
			? [data.project.license, ...data.licenses]
			: data.licenses
	);

</script>

<svelte:head><title>{t('nav.settings')} · {data.project.name} · {data.site.name}</title></svelte:head>

<div class="mx-auto max-w-3xl px-4 py-6">
	{#if form?.message && !(form && 'saved' in form)}<FormError message={form.message} kind="success" />{/if}
	{#if form?.error}<FormError message={form.error} />{/if}

	<!-- Metadata -->
	<section class="surface p-5">
		<h2 class="mb-4 text-sm font-semibold">{t('boardForm.details')}</h2>
		<form method="POST" action="?/save" use:enhance={keepValues}>
			<div class="mb-4">
				<label class="label" for="name">{t('boardForm.name')}</label>
				<input class="input" id="name" name="name" value={data.project.name} required />
			</div>

			<div class="mb-4">
				<label class="label" for="description">{t('boardForm.description')}</label>
				<textarea class="textarea" id="description" name="description" maxlength="500">{data.project.description}</textarea>
			</div>

			<div class="mb-4 grid gap-4 sm:grid-cols-2">
				<div>
					<label class="label" for="license">{t('boardForm.license')}</label>
					<select class="select" id="license" name="license" bind:value={license}>
						<option value="">{t('boardForm.noLicense')}</option>
						{#each licenseOptions as id}
							<option value={id}>{licenseName(id, t('license.proprietary'))}</option>
						{/each}
					</select>
					<div class="mt-2"><LicenseSummary {license} /></div>
				</div>
				<div>
					<label class="label" for="visibility">{t('boardForm.visibility')}</label>
					<select class="select" id="visibility" name="visibility">
						<option value="public" selected={data.project.visibility === 'public'}>{t('common.public')}</option>
						<option value="private" selected={data.project.visibility === 'private'}>{t('common.private')}</option>
					</select>
				</div>
			</div>

			<div class="mb-4 grid gap-4 sm:grid-cols-2">
				<div>
					<label class="label" for="default_branch">{t('boardForm.branch')}</label>
					<input class="input mono" id="default_branch" name="default_branch" value={data.project.default_branch} />
					<p class="hint">{t('boardForm.branchHint')}</p>
				</div>
				<div>
					<label class="label" for="source_url">{t('overview.upstream')}</label>
					<input class="input" id="source_url" name="source_url" type="url" value={data.project.source_url} placeholder="https://github.com/…" />
				</div>
			</div>

			<div class="mb-4">
				<span class="label">{t('nav.tags')}</span>
				<TagPicker tags={data.allTags} selected={data.project.tags.map((tag) => tag.slug)} />
			</div>

			<div class="flex flex-wrap items-center gap-3">
				<button class="btn btn-primary" type="submit">{t('common.saveChanges')}</button>
				<SavedNote message={form && 'saved' in form ? form.message : null} token={form} />
			</div>
		</form>
	</section>

	<!-- Upload -->
	<section class="surface mt-4 p-5">
		<h2 class="mb-1 text-sm font-semibold">{t('boardForm.uploadTitle')}</h2>
		<p class="mb-4 text-xs leading-relaxed text-[var(--text-secondary)]">
			{#each tParts('boardForm.uploadHint') as part}
				{#if typeof part === 'string'}{part}{:else}<span class="mono">{data.project.default_branch}</span>{/if}
			{/each}
		</p>

		<form
			method="POST"
			action="?/upload"
			enctype="multipart/form-data"
			use:enhance={() => {
				uploading = true;
				return async ({ update }) => {
					await update();
					uploading = false;
					file = null;
				};
			}}
		>
			<div class="mb-3">
				<label class="label" for="message">{t('boardForm.message')}</label>
				<input class="input" id="message" name="message" placeholder={t('boardForm.messagePlaceholder')} />
			</div>

			<label class="traces mb-3 flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-6 text-center">
				<Icon name="upload" size={20} class="text-[var(--text-muted)]" />
				{#if file}
					<span class="mono text-sm">{file.name}</span>
					<span class="text-xs text-[var(--text-muted)]">{formatBytes(file.size)}</span>
				{:else}
					<span class="text-sm">{#each tParts('boardForm.chooseZip') as part}{#if typeof part === 'string'}{part}{:else}<span class="mono">.zip</span>{/if}{/each}</span>
				{/if}
				<input
					class="sr-only"
					type="file"
					name="archive"
					accept=".zip,application/zip"
					onchange={(event) => (file = event.currentTarget.files?.[0] ?? null)}
				/>
			</label>

			<button class="btn btn-primary" type="submit" disabled={!file || uploading}>
				{uploading ? t('boardForm.uploading') : t('boardForm.upload')}
			</button>
		</form>

		<div class="mt-5 border-t pt-4">
			<h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
				{t('boardForm.orPush')}
			</h3>
			<CloneBox url={data.cloneUrl} username={data.user?.username} />
		</div>
	</section>

	<!-- Danger zone -->
	<section
		class="mt-4 rounded-lg border p-5"
		style:border-color="color-mix(in srgb, var(--err) 35%, transparent)"
	>
		<h2 class="mb-1 text-sm font-semibold" style:color="var(--err)">{t('boardForm.deleteTitle')}</h2>
		<p class="mb-4 text-xs leading-relaxed text-[var(--text-secondary)]">
			{t('boardForm.deleteHint')}
		</p>
		<form method="POST" action="?/delete" use:enhance>
			<label class="label" for="confirm">
				{#each tParts('boardForm.typeToConfirm') as part}
					{#if typeof part === 'string'}{part}{:else}<span class="mono text-[var(--text-primary)]">{data.project.slug}</span>{/if}
				{/each}
			</label>
			<div class="flex flex-wrap gap-2">
				<input class="input mono !w-auto flex-1" id="confirm" name="confirm" bind:value={confirmText} autocomplete="off" />
				<button class="btn btn-danger" type="submit" disabled={confirmText !== data.project.slug}>
					<Icon name="trash" size={13} /> {t('boardForm.delete')}
				</button>
			</div>
		</form>
	</section>
</div>

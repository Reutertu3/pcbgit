<script lang="ts">
	import { enhance } from '$app/forms';
	import FormError from '$lib/components/FormError.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import TagChip from '$lib/components/TagChip.svelte';
	import { relativeTime } from '$lib/format';
	import { t } from '$lib/i18n/t';
	import { categoryLabel } from '$lib/tagcategory';
	import { sameTag } from '$lib/tagname';

	let { data, form } = $props();

	let name = $state('');
	let category = $state('');
	$effect.pre(() => {
		if (!category) category = data.categories[0]?.id ?? '';
	});
	// Checked as you type, so ESP32S3 finds ESP32-S3 before anything is sent.
	const duplicate = $derived(sameTag(data.tags, name));

	const STATUS = {
		open: { label: 'tagRequest.status.open', color: 'var(--info)' },
		approved: { label: 'tagRequest.status.approved', color: 'var(--ok)' },
		rejected: { label: 'tagRequest.status.rejected', color: 'var(--err)' }
	} as const;
</script>

<svelte:head><title>{t('tagRequest.title')} · {data.site.name}</title></svelte:head>

<div class="mx-auto max-w-2xl px-4 py-6">
	<a href="/tags" class="text-xs text-[var(--text-muted)] hover:text-[var(--accent)]">← {t('nav.tags')}</a>
	<h1 class="mt-1 text-xl font-semibold tracking-tight">{t('tagRequest.title')}</h1>
	<p class="mt-1 text-sm text-[var(--text-secondary)]">{t('tagRequest.intro')}</p>

	<div class="mt-5">
		{#if form?.saved}
			<FormError kind="success" message={t(form.joined ? 'tagRequest.joined' : 'tagRequest.sent', { name: form.name })} />
		{/if}
		{#if form?.error}<FormError message={form.error} />{/if}
	</div>

	<form
		method="POST"
		class="surface flex flex-col gap-4 p-4"
		use:enhance={() => async ({ result, update }) => {
			await update();
			if (result.type === 'success') name = '';
		}}
	>
		{#if data.board}
			<input type="hidden" name="board" value={data.board.path} />
			<p class="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
				<Icon name="board" size={13} />
				{t('tagRequest.forBoard', { board: data.board.name })}
			</p>
		{/if}
		<div class="grid gap-3 sm:grid-cols-[1fr_auto]">
			<div>
				<label class="label" for="request-name">{t('tagRequest.name')}</label>
				<input
					class="input"
					id="request-name"
					name="name"
					maxlength="40"
					required
					bind:value={name}
					aria-describedby="request-name-hint"
				/>
			</div>
			<div>
				<label class="label" for="request-category">{t('adminTags.category')}</label>
				<select class="select" id="request-category" name="category" bind:value={category}>
					{#each data.categories as option}<option value={option.id}>{categoryLabel(option.id, option.name)}</option>{/each}
				</select>
			</div>
		</div>
		<p id="request-name-hint" class="hint !mt-0">
			{#if duplicate}
				<span class="flex flex-wrap items-center gap-1.5 text-[var(--warn)]">
					{t('tagRequest.duplicate')}
					<TagChip tag={duplicate} href="/?tag={duplicate.slug}" />
				</span>
			{:else}
				{t('tagRequest.nameHint')}
			{/if}
		</p>
		<div>
			<label class="label" for="request-note">{t('tagRequest.note')}</label>
			<textarea class="textarea" id="request-note" name="note" maxlength="300" rows="3" placeholder={t('tagRequest.notePlaceholder')}
			></textarea>
		</div>
		<div class="flex flex-wrap items-center gap-3">
			<button class="btn btn-primary" type="submit" disabled={Boolean(duplicate)}>
				<Icon name="tag" size={14} />
				{t('tagRequest.submit')}
			</button>
			<span class="text-xs text-[var(--text-muted)]">{t('tagRequest.limit', { count: data.maxOpen })}</span>
		</div>
	</form>

	{#if data.requests.length}
		<section class="mt-8">
			<h2 class="mb-2.5 text-sm font-semibold">{t('tagRequest.yours')}</h2>
			<ul class="surface divide-y">
				{#each data.requests as request (request.id)}
					<li class="flex flex-wrap items-start gap-x-3 gap-y-1 px-4 py-3 text-sm">
						<div class="min-w-0 flex-1">
							<div class="flex flex-wrap items-center gap-2">
								<span class="font-medium">{request.name}</span>
								<span class="chip">{categoryLabel(request.category, data.categories.find((c) => c.id === request.category)?.name)}</span>
								{#if request.board}<span class="mono text-xs text-[var(--text-muted)]">{request.board}</span>{/if}
							</div>
							{#if request.status === 'rejected' && request.reason}
								<p class="mt-1 text-xs text-[var(--text-secondary)]">{t('tagRequest.reason', { reason: request.reason })}</p>
							{/if}
							{#if request.status === 'approved' && request.tag_slug}
								<a href="/?tag={request.tag_slug}" class="mt-1 inline-block text-xs hover:text-[var(--accent)]">{t('tagRequest.showBoards')} →</a>
							{/if}
						</div>
						<div class="flex shrink-0 flex-col items-end gap-0.5">
							<span class="chip" style:color={STATUS[request.status].color}>{t(STATUS[request.status].label)}</span>
							<span class="text-[0.6875rem] text-[var(--text-muted)]">{relativeTime(request.decided_at ?? request.created_at)}</span>
						</div>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</div>

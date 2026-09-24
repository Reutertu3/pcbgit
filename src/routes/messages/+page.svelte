<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto, invalidateAll } from '$app/navigation';
	import Icon from '$lib/components/Icon.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import NotificationText from '$lib/components/NotificationText.svelte';
	import { notificationHref } from '$lib/notifications';
	import { t } from '$lib/i18n/t';
	import type { NotificationView } from '$lib/types';

	let { data, form } = $props();

	const unread = $derived(data.messages.some((item) => !item.read_at));

	async function openMessage(event: MouseEvent, item: NotificationView) {
		if (item.read_at || event.ctrlKey || event.metaKey || event.shiftKey || event.button !== 0) return;
		event.preventDefault();
		await fetch('/notifications', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ id: item.id })
		});
		await invalidateAll();
		goto(notificationHref(item));
	}
</script>

<svelte:head><title>{t('nav.messages')} · {data.site.name}</title></svelte:head>

<div class="mx-auto max-w-2xl px-4 py-6">
	{#if form?.error}<FormError message={form.error} />{/if}

	<section class="surface p-5">
		<div class="mb-3 flex items-center justify-between gap-3">
			<h1 class="text-lg font-semibold tracking-tight">{t('nav.messages')}</h1>
			{#if unread}
				<form method="POST" action="?/markAllRead" use:enhance>
					<button class="text-xs text-[var(--accent)] hover:underline" type="submit">{t('notifications.markAll')}</button>
				</form>
			{/if}
		</div>
		{#if !data.messages.length}
			<p class="py-4 text-center text-xs text-[var(--text-muted)]">{t('notifications.empty')}</p>
		{:else}
			<ul class="divide-y rounded-lg border">
				{#each data.messages as item (item.id)}
					<li class:unread={!item.read_at}>
						<a href={notificationHref(item)} class="flex items-start gap-2 px-3 py-2.5 hover:bg-s3" onclick={(event) => openMessage(event, item)}>
							<span class="dot mt-1.5" aria-hidden="true"></span>
							<span class="min-w-0 flex-1"><NotificationText {item} /></span>
						</a>
					</li>
				{/each}
			</ul>
			{#if data.pageCount > 1}
				<nav class="mt-3 flex items-center justify-center gap-2" aria-label={t('browse.pagination')}>
					<a
						href="?page={data.page - 1}"
						class="btn btn-sm"
						class:pointer-events-none={data.page <= 1}
						class:opacity-40={data.page <= 1}
						aria-disabled={data.page <= 1}
					>
						<Icon name="chevronLeft" size={13} /> {t('browse.previous')}
					</a>
					<span class="mono px-2 text-xs text-[var(--text-muted)]">
						{t('browse.page', { page: data.page, pages: data.pageCount })}
					</span>
					<a
						href="?page={data.page + 1}"
						class="btn btn-sm"
						class:pointer-events-none={data.page >= data.pageCount}
						class:opacity-40={data.page >= data.pageCount}
						aria-disabled={data.page >= data.pageCount}
					>
						{t('browse.next')} <Icon name="chevronRight" size={13} />
					</a>
				</nav>
			{/if}
		{/if}
	</section>
</div>

<style>
	.dot {
		width: 0.45rem;
		height: 0.45rem;
		flex-shrink: 0;
		border-radius: 999px;
		background: transparent;
	}
	.unread .dot {
		background: var(--accent);
	}
	.unread {
		background: color-mix(in srgb, var(--accent) 6%, transparent);
	}
</style>

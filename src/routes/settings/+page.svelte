<script lang="ts">
	import { enhance } from '$app/forms';
	import { keepValues } from '$lib/forms';
	import Icon from '$lib/components/Icon.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import SavedNote from '$lib/components/SavedNote.svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import NotificationText from '$lib/components/NotificationText.svelte';
	import { goto, invalidateAll } from '$app/navigation';
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

<svelte:head><title>{t('nav.userCenter')} · {data.site.name}</title></svelte:head>

<div class="mx-auto max-w-2xl px-4 py-6">
	<div class="mb-5 flex items-center gap-3">
		<Avatar name={data.profile.displayName || data.profile.username} size={44} />
		<div>
			<h1 class="text-lg font-semibold tracking-tight">{t('account.title')}</h1>
			<p class="mono text-xs text-[var(--text-muted)]">@{data.profile.username}</p>
		</div>
		<div class="flex-1"></div>
		<a href="/settings/tokens" class="btn btn-sm"><Icon name="git" size={13} /> {t('nav.tokens')}</a>
	</div>

	{#if form?.error}<FormError message={form.error} />{/if}

	<section class="surface p-5" id="messages">
		<div class="mb-3 flex items-center justify-between gap-3">
			<h2 class="text-sm font-semibold">{t('userCenter.messages')}</h2>
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
			{#if data.messagePageCount > 1}
				<nav class="mt-3 flex items-center justify-center gap-2" aria-label={t('browse.pagination')}>
					<a
						href="?page={data.messagePage - 1}#messages"
						class="btn btn-sm"
						class:pointer-events-none={data.messagePage <= 1}
						class:opacity-40={data.messagePage <= 1}
						aria-disabled={data.messagePage <= 1}
					>
						<Icon name="chevronLeft" size={13} /> {t('browse.previous')}
					</a>
					<span class="mono px-2 text-xs text-[var(--text-muted)]">
						{t('browse.page', { page: data.messagePage, pages: data.messagePageCount })}
					</span>
					<a
						href="?page={data.messagePage + 1}#messages"
						class="btn btn-sm"
						class:pointer-events-none={data.messagePage >= data.messagePageCount}
						class:opacity-40={data.messagePage >= data.messagePageCount}
						aria-disabled={data.messagePage >= data.messagePageCount}
					>
						{t('browse.next')} <Icon name="chevronRight" size={13} />
					</a>
				</nav>
			{/if}
		{/if}
	</section>

	<section class="surface mt-4 p-5">
		<h2 class="mb-4 text-sm font-semibold">{t('account.profile')}</h2>
		<form method="POST" action="?/profile" use:enhance={keepValues}>
			<div class="mb-4">
				<label class="label" for="display_name">{t('account.displayName')}</label>
				<input class="input" id="display_name" name="display_name" value={data.profile.displayName} maxlength="80" />
			</div>
			<div class="mb-4">
				<label class="label" for="email">{t('auth.email')}</label>
				<input class="input" id="email" name="email" type="email" value={data.profile.email} required />
				<p class="hint">{t('account.emailHint')}</p>
			</div>
			<div class="mb-4">
				<label class="label" for="bio">{t('account.bio')}</label>
				<textarea class="textarea !min-h-16" id="bio" name="bio" maxlength="300">{data.profile.bio}</textarea>
			</div>
			<div class="flex flex-wrap items-center gap-3">
				<button class="btn btn-primary" type="submit">{t('account.saveProfile')}</button>
				<SavedNote message={form && 'saved' in form ? form.message : null} token={form} />
			</div>
		</form>
	</section>

	<section class="surface mt-4 p-5">
		<h2 class="mb-1 text-sm font-semibold">{t('account.changePassword')}</h2>
		<p class="mb-4 text-xs text-[var(--text-secondary)]">
			{t('account.passwordHint')}
		</p>
		<form method="POST" action="?/password" use:enhance>
			<div class="mb-3">
				<label class="label" for="current">{t('account.currentPassword')}</label>
				<input class="input" id="current" name="current" type="password" autocomplete="current-password" required />
			</div>
			<div class="mb-4">
				<label class="label" for="next">{t('account.newPassword')}</label>
				<input class="input" id="next" name="next" type="password" autocomplete="new-password" minlength="8" required />
			</div>
			<button class="btn" type="submit">{t('account.changePassword')}</button>
		</form>
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

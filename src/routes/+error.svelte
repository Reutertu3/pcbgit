<script lang="ts">
	import { page } from '$app/state';
	import Icon from '$lib/components/Icon.svelte';
	import { t } from '$lib/i18n/t';
	import type { MessageKey } from '$lib/i18n';

	// Page loads throw translation keys ("error.boardNotFound"); anything else is shown as is.
	const message = $derived(t((page.error?.message ?? '') as MessageKey));
	const title = $derived(
		page.status === 404 ? t('error.notFoundTitle') : page.status === 403 ? t('error.forbiddenTitle') : t('error.title')
	);
</script>

<svelte:head><title>{page.status} · {title}</title></svelte:head>

<div class="mx-auto flex min-h-[calc(100vh-14rem)] max-w-md flex-col items-center justify-center gap-3 px-4 py-16 text-center">
	<Icon name={page.status === 404 ? 'search' : 'alert'} size={30} class="text-[var(--text-muted)]" />
	<p class="mono text-sm text-[var(--text-muted)]">{page.status}</p>
	<h1 class="text-xl font-semibold tracking-tight">{title}</h1>
	{#if message && message !== title}
		<p class="text-sm text-[var(--text-secondary)]">{message}</p>
	{/if}
	<a href="/" class="btn btn-sm mt-2">{t('error.home')}</a>
</div>

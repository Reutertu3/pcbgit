<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import Icon from './Icon.svelte';
	import { LOCALE_COOKIE, LOCALES, type Locale } from '$lib/i18n';
	import { locale, t } from '$lib/i18n/t';

	let open = $state(false);

	async function choose(id: Locale) {
		open = false;
		if (id === locale()) return;
		document.cookie = `${LOCALE_COOKIE}=${id}; path=/; max-age=31536000; samesite=lax`;
		document.documentElement.lang = id;
		// The server renders in the cookie's language; reloading the data switches every string.
		await invalidateAll();
	}
</script>

<svelte:window onclick={() => (open = false)} />

<div class="relative">
	<button
		class="btn btn-ghost !gap-1 px-2"
		onclick={(event) => {
			event.stopPropagation();
			open = !open;
		}}
		title={t('nav.language')}
		aria-label={t('nav.language')}
		aria-haspopup="listbox"
		aria-expanded={open}
	>
		<Icon name="globe" size={15} />
		<span class="mono text-[0.6875rem] uppercase">{locale()}</span>
	</button>

	{#if open}
		<ul
			class="surface-raised absolute right-0 top-full z-50 mt-1.5 w-40 p-1 shadow-xl"
			role="listbox"
			aria-label={t('nav.language')}
		>
			{#each Object.entries(LOCALES) as [id, label]}
				<li>
					<button
						class="menu-item w-full"
						class:bg-s3={locale() === id}
						role="option"
						aria-selected={locale() === id}
						lang={id}
						onclick={(event) => {
							event.stopPropagation();
							choose(id as Locale);
						}}
					>
						<span class="mono w-5 text-[0.6875rem] uppercase text-[var(--text-muted)]">{id}</span>
						<span class="flex-1 text-left">{label}</span>
						{#if locale() === id}<Icon name="check" size={13} />{/if}
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>

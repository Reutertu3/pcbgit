<script lang="ts">
	import { toolbarMenu } from '$lib/menus.svelte';
	import Icon from './Icon.svelte';
	import { DEFAULT_THEME, THEMES } from '$lib/themes';
	import { t } from '$lib/i18n/t';

	const GROUPS = [
		{ label: 'theme.light' as const, themes: THEMES.filter((theme) => !theme.dark) },
		{ label: 'theme.dark' as const, themes: THEMES.filter((theme) => theme.dark) }
	];

	let current = $state<string>(DEFAULT_THEME);
	const open = $derived(toolbarMenu.isOpen('theme'));

	$effect(() => {
		// Anything unknown (e.g. the old "dark" value) falls back to the default.
		const stored = document.documentElement.dataset.theme;
		current = THEMES.some((theme) => theme.id === stored) ? stored! : DEFAULT_THEME;
	});

	function choose(id: string) {
		current = id;
		toolbarMenu.close('theme');
		document.documentElement.dataset.theme = id;
		try {
			localStorage.setItem('pcbgit-theme', id);
		} catch {
			// Private browsing: the choice just will not persist.
		}
	}
</script>

<svelte:window onclick={() => toolbarMenu.close('theme')} />

<div class="relative">
	<button
		class="btn btn-ghost px-2"
		onclick={(event) => {
			event.stopPropagation();
			toolbarMenu.toggle('theme');
		}}
		title={t('nav.theme')}
		aria-label={t('nav.theme')}
		aria-haspopup="listbox"
		aria-expanded={open}
	>
		<Icon name="sun" size={15} />
	</button>

	{#if open}
		<ul
			class="surface-raised absolute right-0 top-full z-50 mt-1.5 w-52 p-1 shadow-xl"
			role="listbox"
			aria-label={t('nav.theme')}
		>
			{#each GROUPS as group}
				<li role="presentation" class="px-2 pb-0.5 pt-1.5 text-[0.625rem] font-semibold tracking-wider text-[var(--text-muted)] uppercase">
					{t(group.label)}
				</li>
				{#each group.themes as theme}
					<li>
						<button
							class="menu-item w-full"
							class:bg-s3={current === theme.id}
							role="option"
							aria-selected={current === theme.id}
							onclick={(event) => {
								event.stopPropagation();
								choose(theme.id);
							}}
						>
							<span class="flex overflow-hidden rounded border" aria-hidden="true">
								{#each theme.swatches as color}
									<span class="h-4 w-2.5" style:background={color}></span>
								{/each}
							</span>
							<span class="flex-1 text-left">{t(`theme.name.${theme.id}`)}</span>
							{#if current === theme.id}<Icon name="check" size={13} />{/if}
						</button>
					</li>
				{/each}
			{/each}
		</ul>
	{/if}
</div>

<script lang="ts">
	import Icon from './Icon.svelte';
	import { DEFAULT_THEME, THEMES } from '$lib/themes';

	let current = $state<string>(DEFAULT_THEME);
	let open = $state(false);

	$effect(() => {
		// Anything unknown (e.g. the old "dark" value) falls back to the default.
		const stored = document.documentElement.dataset.theme;
		current = THEMES.some((theme) => theme.id === stored) ? stored! : DEFAULT_THEME;
	});

	function choose(id: string) {
		current = id;
		open = false;
		document.documentElement.dataset.theme = id;
		try {
			localStorage.setItem('kupfergit-theme', id);
		} catch {
			// Private browsing: the choice just will not persist.
		}
	}
</script>

<svelte:window onclick={() => (open = false)} />

<div class="relative">
	<button
		class="btn btn-ghost px-2"
		onclick={(event) => {
			event.stopPropagation();
			open = !open;
		}}
		title="Theme"
		aria-label="Choose theme"
		aria-haspopup="listbox"
		aria-expanded={open}
	>
		<Icon name="sun" size={15} />
	</button>

	{#if open}
		<ul
			class="surface-raised absolute right-0 top-full z-50 mt-1.5 w-52 p-1 shadow-xl"
			role="listbox"
			aria-label="Theme"
		>
			{#each THEMES as theme}
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
						<span class="flex-1 text-left">{theme.label}</span>
						{#if current === theme.id}<Icon name="check" size={13} />{/if}
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>

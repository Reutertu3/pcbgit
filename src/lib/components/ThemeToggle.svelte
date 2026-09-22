<script lang="ts">
	import Icon from './Icon.svelte';

	let theme = $state<'dark' | 'light'>('dark');

	$effect(() => {
		theme = (document.documentElement.dataset.theme as 'dark' | 'light') ?? 'dark';
	});

	function toggle() {
		theme = theme === 'dark' ? 'light' : 'dark';
		document.documentElement.dataset.theme = theme;
		try {
			localStorage.setItem('pcbhub-theme', theme);
		} catch {
			// Private browsing: the choice just will not persist.
		}
	}
</script>

<button
	class="btn btn-ghost px-2"
	onclick={toggle}
	title="Switch to {theme === 'dark' ? 'light' : 'dark'} theme"
	aria-label="Switch to {theme === 'dark' ? 'light' : 'dark'} theme"
>
	<Icon name={theme === 'dark' ? 'sun' : 'moon'} size={15} />
</button>

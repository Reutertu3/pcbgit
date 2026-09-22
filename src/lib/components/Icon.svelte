<script lang="ts">
	import { ICONS, type IconName } from '$lib/icons';

	interface Props {
		name: IconName;
		size?: number;
		class?: string;
		fill?: boolean;
		strokeWidth?: number;
		style?: string;
	}

	let {
		name,
		size = 16,
		class: className = '',
		fill = false,
		strokeWidth = 1.7,
		style = ''
	}: Props = $props();

	// Each icon is one or more subpaths in a single `d` string.
	const paths = $derived(ICONS[name].split(' M').map((d, i) => (i === 0 ? d : `M${d}`)));
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill={fill ? 'currentColor' : 'none'}
	stroke="currentColor"
	stroke-width={strokeWidth}
	stroke-linecap="round"
	stroke-linejoin="round"
	class={className}
	{style}
	aria-hidden="true"
>
	{#each paths as d}
		<path {d} />
	{/each}
</svg>

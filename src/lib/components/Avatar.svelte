<script lang="ts">
	import { hueFor, initials } from '$lib/format';

	interface Props {
		name: string;
		size?: number;
		/** With `avatar` (the picture's version), shows the uploaded picture instead of initials. */
		username?: string;
		avatar?: number | null;
	}
	let { name, size = 24, username, avatar = null }: Props = $props();

	const hue = $derived(hueFor(name));
</script>

{#if username && avatar}
	<img
		class="inline-block shrink-0 rounded-full object-cover"
		src="/avatars/{username}?v={avatar}"
		alt=""
		width={size}
		height={size}
		style:width="{size}px"
		style:height="{size}px"
		title={name}
		loading="lazy"
	/>
{:else}
	<span
		class="inline-flex shrink-0 items-center justify-center rounded-full font-semibold"
		style:width="{size}px"
		style:height="{size}px"
		style:font-size="{Math.round(size * 0.4)}px"
		style:background="hsl({hue} 45% 26%)"
		style:color="hsl({hue} 70% 82%)"
		title={name}
	>
		{initials(name)}
	</span>
{/if}

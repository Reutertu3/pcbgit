<script lang="ts">
	import { hueFor, initials } from '$lib/format';

	interface Props {
		name: string;
		size?: number;
	}
	let { name, size = 24 }: Props = $props();

	const hue = $derived(hueFor(name));
</script>

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

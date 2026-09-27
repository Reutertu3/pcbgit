<script lang="ts" module>
	/**
	 * Quick picks for tag and category colours: hues around the wheel at a similar,
	 * muted lightness, so any of them reads on light and dark themes, plus a grey.
	 * The colour input still allows any colour.
	 */
	export const COLOR_PRESETS = [
		'#e06c75', '#e5925a', '#e2b862', '#b5bd68', '#8cc49a', '#5fb3a1',
		'#82b4c8', '#6ba4e8', '#8b9cf0', '#b39ddb', '#c4829a', '#8a9a8b'
	];
</script>

<script lang="ts">
	import { t } from '$lib/i18n/t';

	interface Props {
		/** Submitted with the form under this name. */
		name: string;
		value?: string;
		id?: string;
		/** Called when the admin picks a colour, by swatch or input. */
		onpick?: (color: string) => void;
	}
	let { name, value = $bindable('#8a9a8b'), id, onpick }: Props = $props();

	function pick(color: string) {
		value = color;
		onpick?.(color);
	}
</script>

<span class="flex flex-wrap items-center gap-2">
	<input
		{id}
		type="color"
		{name}
		class="h-7 w-9 cursor-pointer rounded border bg-transparent"
		bind:value
		oninput={() => onpick?.(value)}
		aria-label={id ? undefined : t('adminTags.colour')}
	/>
	<span class="flex flex-wrap gap-1">
		{#each COLOR_PRESETS as color}
			<button
				type="button"
				class="h-5 w-5 rounded-full border-2 transition-transform hover:scale-110"
				style:background={color}
				style:border-color={value.toLowerCase() === color ? 'var(--text-primary)' : 'transparent'}
				onclick={() => pick(color)}
				title={color}
				aria-label={t('adminTags.useColour', { color })}
			></button>
		{/each}
	</span>
</span>

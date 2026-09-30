<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';
	import Icon from './Icon.svelte';
	import { t } from '$lib/i18n/t';

	interface Props extends Omit<HTMLInputAttributes, 'type' | 'value'> {
		value?: string;
		/** Layout classes for the wrapper (flex-1, max-w-xs); `class` goes to the input. */
		wrapperClass?: string;
	}
	let { value = $bindable(''), class: className = 'input', wrapperClass = '', ...rest }: Props = $props();

	// A typo in a new password goes unnoticed while it is dots.
	let shown = $state(false);
</script>

<div class="relative {wrapperClass}">
	<input {...rest} bind:value type={shown ? 'text' : 'password'} class="{className} !pr-9" autocapitalize="off" spellcheck="false" />
	<button
		type="button"
		class="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)]"
		onclick={() => (shown = !shown)}
		aria-label={shown ? t('auth.hidePassword') : t('auth.showPassword')}
		aria-pressed={shown}
		title={shown ? t('auth.hidePassword') : t('auth.showPassword')}
	>
		<Icon name={shown ? 'eyeOff' : 'eye'} size={14} />
	</button>
</div>

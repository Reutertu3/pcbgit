<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLInputAttributes } from 'svelte/elements';

	/**
	 * The on/off switch used for every setting or view option that is simply on or
	 * off (an iOS-style switch). A real checkbox underneath, so it posts with forms,
	 * binds like one and works from the keyboard.
	 */
	interface Props extends Omit<HTMLInputAttributes, 'type' | 'size'> {
		checked?: boolean;
		/** `sm` for toolbars and dense rows; the default for settings. */
		size?: 'md' | 'sm';
		/** The label, shown to the right. */
		children?: Snippet;
		class?: string;
	}
	let { checked = $bindable(false), size = 'md', children, class: className = '', ...rest }: Props = $props();
</script>

<label class="switch {size} {className}">
	<input type="checkbox" role="switch" bind:checked {...rest} />
	<span class="track" aria-hidden="true"></span>
	{#if children}<span class="text">{@render children()}</span>{/if}
</label>

<style>
	.switch {
		--w: 2.875rem;
		--h: 1.625rem;
		--gap: 2px;
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
	}
	.switch.sm {
		--w: 2.125rem;
		--h: 1.25rem;
	}
	.text {
		flex: 1;
		min-width: 0;
	}
	/* Hidden but focusable, so the keyboard reaches it. */
	input {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
		pointer-events: none;
	}
	.track {
		position: relative;
		flex-shrink: 0;
		width: var(--w);
		height: var(--h);
		border-radius: 999px;
		background: var(--border-strong);
		transition: background-color 0.3s linear;
	}
	/* The inner face: fills the track while off, shrinks away as it turns on. */
	.track::before {
		content: '';
		position: absolute;
		inset: var(--gap);
		border-radius: 999px;
		background: var(--surface-2);
		transition: transform 0.25s linear;
	}
	/* The knob; stretches while pressed, as on iOS. */
	.track::after {
		content: '';
		position: absolute;
		top: var(--gap);
		left: var(--gap);
		width: calc(var(--h) - 2 * var(--gap));
		height: calc(var(--h) - 2 * var(--gap));
		border-radius: 999px;
		background: #fff;
		box-shadow: 0 2px 2px rgb(0 0 0 / 0.24);
		transition:
			transform 0.2s ease-in-out,
			width 0.2s ease-in-out;
	}
	.switch:active .track::after {
		width: calc(var(--h) - 2 * var(--gap) + 0.375rem);
	}
	input:checked + .track {
		background: var(--ok);
	}
	input:checked + .track::before {
		transform: scale(0);
	}
	input:checked + .track::after {
		transform: translateX(calc(var(--w) - var(--h)));
	}
	.switch:active input:checked + .track::after {
		transform: translateX(calc(var(--w) - var(--h) - 0.375rem));
	}
	input:focus-visible + .track {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	input:disabled + .track {
		opacity: 0.5;
	}
	.switch:has(input:disabled) {
		cursor: default;
	}
	@media (prefers-reduced-motion: reduce) {
		.track,
		.track::before,
		.track::after {
			transition: none;
		}
	}
</style>

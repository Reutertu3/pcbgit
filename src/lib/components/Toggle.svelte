<script lang="ts">
	/**
	 * An on/off slider. Under the knob lie two halves, "on" in green and "off" in red;
	 * the knob covers the half that does not apply, and sliding shows both. A submit
	 * button, so it works inside a form without JavaScript.
	 */
	interface Props {
		checked: boolean;
		/** What it switches, for screen readers. */
		label: string;
		onText: string;
		offText: string;
		disabled?: boolean;
	}
	let { checked, label, onText, offText, disabled = false }: Props = $props();
</script>

<button type="submit" role="switch" aria-checked={checked} aria-label={label} class="toggle" class:on={checked} {disabled}>
	<span class="half on-half" aria-hidden="true">{onText}</span>
	<span class="half off-half" aria-hidden="true">{offText}</span>
	<span class="knob" aria-hidden="true"></span>
</button>

<style>
	.toggle {
		position: relative;
		display: inline-flex;
		flex-shrink: 0;
		width: 6rem;
		height: 2.25rem;
		padding: 0;
		overflow: hidden;
		border: 1px solid var(--border-strong);
		border-radius: 999px;
		background: var(--surface-2);
		cursor: pointer;
	}
	.toggle:disabled {
		cursor: default;
		opacity: 0.6;
	}
	.toggle:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.half {
		display: flex;
		width: 50%;
		align-items: center;
		justify-content: center;
		color: var(--on-accent);
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.on-half {
		background: var(--ok);
	}
	.off-half {
		background: var(--err);
	}
	/* Once the knob has arrived, the half under it takes the colour of the one showing,
	   so no rim of the other colour peeks out beside the knob. Leaving, it changes back
	   at once, so sliding shows both. */
	.on .off-half {
		background: var(--ok);
		transition: background 0s linear 0.25s;
	}
	.toggle:not(.on) .on-half {
		background: var(--err);
		transition: background 0s linear 0.25s;
	}
	/* Off: the knob covers the green half. On: it slides over the red one. */
	.knob {
		position: absolute;
		top: 3px;
		left: 3px;
		width: calc(50% - 6px);
		height: calc(100% - 6px);
		border-radius: 999px;
		background: var(--surface-1);
		box-shadow: 0 1px 3px rgb(0 0 0 / 0.35);
		transition: transform 0.25s ease;
	}
	.on .knob {
		transform: translateX(calc(100% + 6px));
	}
	@media (prefers-reduced-motion: reduce) {
		.knob,
		.half {
			transition: none !important;
		}
	}
</style>

<!--
	Decorative board fragment behind the front-page hero: traces with 45° bends, an
	SOIC, a QFP, passives, a pin header, vias and teardrops. Coloured from theme
	tokens and faded out towards the left, where the headline sits.
-->
<script lang="ts">
	/** Vias: where they sit, and which way their trace leaves (for the teardrop). */
	const VIAS = [
		{ x: 540, y: 25, to: [1, 0] },
		{ x: 740, y: 20, to: [-1, 0] },
		{ x: 655, y: 240, to: [0, -1] },
		{ x: 520, y: 160, to: [0, 1] },
		// U1 fan-out at its corners and right side
		{ x: 595, y: 50, to: [1, 1] },
		{ x: 722, y: 85, to: [-1, 1] },
		{ x: 685, y: 212, to: [-1, -1] },
		{ x: 562, y: 175, to: [1, -1] }
	];
	/** J1's round pins; pin 1 is square and gets none. */
	const PINS = [90, 130, 170, 210];

	/**
	 * A teardrop: copper widening from a trace (width `w`) into a round pad or via
	 * of radius `r`, as KiCad adds them. Its base lies across the pad, which covers it.
	 */
	function teardrop(x: number, y: number, [dx, dy]: number[], r: number, w = 5) {
		const length = Math.hypot(dx, dy);
		const [ux, uy] = [dx / length, dy / length];
		const at = (along: number, across: number) =>
			`${(x + ux * along - uy * across).toFixed(1)} ${(y + uy * along + ux * across).toFixed(1)}`;
		const tip = r * 2.1;
		return `M${at(0, r)}Q${at(r * 0.9, r * 0.55)} ${at(tip, w / 2)}L${at(tip, -w / 2)}Q${at(r * 0.9, -r * 0.55)} ${at(0, -r)}Z`;
	}
</script>

<svg class="hero-board" viewBox="0 0 900 260" preserveAspectRatio="xMaxYMid meet" aria-hidden="true">
	<g class="cu">
		<!-- U2 → U1 bus -->
		<path d="M500 65H530L560 95H578M500 85H520L550 115H578M500 105H510L540 135H578M500 125H505L535 155H578" />
		<!-- U1 → J1 -->
		<path d="M702 105H790L805 90H860M702 125H795L800 130H860M702 145H790L815 170H860M702 165H735L780 210H860" />
		<!-- U1 → R1 → J1 -->
		<path d="M665 68V55L675 45H764M796 45H830L835 50H860" />
		<!-- escapes to vias and C1 -->
		<path d="M615 68V40L600 25H540M645 68V30L655 20H740M615 192V200L600 215H527M655 192V240M520 189V160" />
		<!-- more U1 pins to vias, one at each free corner and one on the right -->
		<path d="M605 68V60L595 50M702 95H712L722 85M675 192V202L685 212M578 165H572L562 175" />
		<!-- U2 fan-out, running off under the headline -->
		<path d="M440 65H400L380 45H-600M440 85H360L340 65H-600M440 105H-600M440 125H400L380 145H-600" />
		<path class="thin" d="M300 195H120L95 220H-600M280 30H60L40 10H-600" />
	</g>

	<g class="cu-fill">
		{#each VIAS as via}
			<path d={teardrop(via.x, via.y, via.to, 6)} />
		{/each}
		{#each PINS as y}
			<path d={teardrop(860, y, [-1, 0], 10)} />
		{/each}
	</g>

	<g class="pad">
		<!-- U1: QFP, 8 pads a side -->
		{#each Array(8) as _, i}
			<rect x={603 + i * 10} y="68" width="4" height="12" />
			<rect x={603 + i * 10} y="180" width="4" height="12" />
			<rect x="578" y={93 + i * 10} width="12" height="4" />
			<rect x="690" y={93 + i * 10} width="12" height="4" />
		{/each}
		<!-- U2: SOIC-8 -->
		{#each [65, 85, 105, 125] as y}
			<rect x="440" y={y - 3.5} width="16" height="7" rx="1" />
			<rect x="484" y={y - 3.5} width="16" height="7" rx="1" />
		{/each}
		<!-- R1, C1: 0805 -->
		<rect x="764" y="38" width="12" height="14" rx="1.5" />
		<rect x="784" y="38" width="12" height="14" rx="1.5" />
		<rect x="513" y="189" width="14" height="12" rx="1.5" />
		<rect x="513" y="209" width="14" height="12" rx="1.5" />
		<!-- J1: 1×5 header, pin 1 square -->
		<rect x="850" y="40" width="20" height="20" rx="2" />
		{#each PINS as y}
			<circle cx="860" cy={y} r="10" />
		{/each}
		<!-- vias -->
		{#each VIAS as via}
			<circle cx={via.x} cy={via.y} r="6" />
		{/each}
		<!-- H1: mounting hole -->
		<circle cx="330" cy="215" r="17" />
	</g>

	<g class="hole">
		{#each [50, 90, 130, 170, 210] as y}
			<circle cx="860" cy={y} r="4.5" />
		{/each}
		{#each VIAS as via}
			<circle cx={via.x} cy={via.y} r="2.8" />
		{/each}
		<circle cx="330" cy="215" r="10" />
	</g>

	<g class="silk">
		<rect x="598" y="88" width="84" height="84" rx="2" />
		<circle cx="608" cy="98" r="3" class="dot" />
		<rect x="461" y="55" width="18" height="80" />
		<circle cx="432" cy="56" r="2.5" class="dot" />
		<path d="M766 32H794M766 58H794M507 191V219M533 191V219" />
		<rect x="846" y="34" width="28" height="192" rx="2" />
		<text x="640" y="134" text-anchor="middle">U1</text>
		<text x="470" y="150" text-anchor="middle">U2</text>
		<text x="780" y="74" text-anchor="middle">R1</text>
		<text x="545" y="209">C1</text>
		<text x="860" y="244" text-anchor="middle">J1</text>
	</g>
</svg>

<style>
	.hero-board {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
		/* Traces run on past the drawing's left edge and fade out before the headline. */
		overflow: visible;
		mask-image: linear-gradient(to right, transparent 38%, #000 78%);
	}
	/* On phones the headline spans the full width; the board would sit under it. */
	@media (max-width: 640px) {
		.hero-board {
			display: none;
		}
	}
	/* Opaque, mixed with the hero's own background: a teardrop overlapping its
	   trace would show a darker seam if copper were translucent. */
	.cu {
		fill: none;
		stroke: color-mix(in srgb, var(--accent) 32%, var(--surface-1));
		stroke-width: 5;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.cu .thin {
		stroke-width: 3;
	}
	.cu-fill {
		fill: color-mix(in srgb, var(--accent) 32%, var(--surface-1));
	}
	.pad {
		fill: color-mix(in srgb, var(--accent) 55%, transparent);
	}
	.hole {
		fill: var(--surface-1);
	}
	.silk {
		fill: none;
		stroke: color-mix(in srgb, var(--text-muted) 55%, transparent);
		stroke-width: 1.5;
	}
	.silk .dot,
	.silk text {
		fill: color-mix(in srgb, var(--text-muted) 55%, transparent);
		stroke: none;
	}
	.silk text {
		font: 600 11px var(--font-mono, ui-monospace, monospace);
	}
</style>

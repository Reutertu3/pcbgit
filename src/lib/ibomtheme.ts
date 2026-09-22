/**
 * Recolours iBOM pages with the viewer's pcbgit theme. The BOM page reads these
 * tokens from its own stylesheet and passes them along as `?c=hex-hex-…`; the
 * artifact route turns them into a stylesheet injected into the page.
 */
export const IBOM_TOKENS = [
	'surface-0',
	'surface-1',
	'surface-2',
	'surface-3',
	'border-subtle',
	'border-strong',
	'text-primary',
	'text-secondary',
	'text-muted',
	'accent',
	'on-accent',
	'ok',
	'warn',
	'err'
] as const;

type Token = (typeof IBOM_TOKENS)[number];

/** Current theme colours as the `c` parameter, or null if any token is not plain #rrggbb. */
export function ibomColorParam(style: CSSStyleDeclaration) {
	const values = IBOM_TOKENS.map((token) => {
		const value = style.getPropertyValue(`--${token}`).trim().replace(/^#/, '');
		// The minified stylesheet shortens #ffffff to #fff.
		return value.length === 3 ? value.replace(/./g, '$&$&') : value;
	});
	return values.every((value) => /^[0-9a-f]{6}$/i.test(value)) ? values.join('-') : null;
}

const hex = (value: number) => Math.round(value).toString(16).padStart(2, '0');
const rgb = (color: string) => [0, 2, 4].map((i) => parseInt(color.slice(i, i + 2), 16));

/** `a` mixed into `b` by `amount` (0..1). */
function mix(a: string, b: string, amount: number) {
	const [x, y] = [rgb(a), rgb(b)];
	return x.map((value, i) => hex(value * amount + y[i] * (1 - amount))).join('');
}

/**
 * Stylesheet for the `c` parameter, or null when it is malformed. Only hex digits
 * survive validation, so nothing else can be injected into the page this way.
 */
export function ibomThemeCss(param: string | null, dark: boolean): string | null {
	const values = param?.split('-') ?? [];
	if (values.length !== IBOM_TOKENS.length || !values.every((value) => /^[0-9a-f]{6}$/i.test(value))) return null;
	const c = Object.fromEntries(IBOM_TOKENS.map((token, i) => [token, values[i]])) as Record<Token, string>;

	// In dark mode iBOM inverts its toolbar buttons with filter: invert(1) so the black
	// icons turn white; their colours are pre-inverted here to come out right.
	const inv = (color: string) => (dark ? rgb(color).map((value) => hex(255 - value)).join('') : color);

	return `
#topmostdiv {
  --pcb-edge-color: #${c['text-secondary']};
  --pad-color: #${c['text-muted']};
  --pad-hole-color: #${c['surface-1']};
  --pad-color-highlight: #${c.err};
  --pad-color-highlight-both: #${c.warn};
  --pad-color-highlight-marked: #${c.ok};
  --pin1-outline-color: #${c.warn};
  --pin1-outline-color-highlight: #${c.warn};
  --pin1-outline-color-highlight-both: #${c.warn};
  --silkscreen-edge-color: #${c.accent};
  --silkscreen-polygon-color: #${c.accent};
  --silkscreen-text-color: #${c.accent};
  --fabrication-edge-color: #${c['text-muted']};
  --fabrication-polygon-color: #${c['text-muted']};
  --fabrication-text-color: #${c['text-muted']};
  --track-color: #${mix(c['border-strong'], c['surface-1'], 0.6)};
  --track-color-highlight: #${c.err};
  --zone-color: #${mix(c['border-subtle'], c['surface-1'], 0.5)};
  --zone-color-highlight: #${c.err}80;
  background-color: #${c['surface-1']};
  color: #${c['text-primary']};
}
#topmostdiv .bom th, #topmostdiv .bom td, #topmostdiv .stats td { border-color: #${c['border-strong']}; }
#topmostdiv .bom th { background-color: #${c['surface-2']}; }
#topmostdiv .bom tr:nth-child(even) { background-color: #${mix(c['surface-2'], c['surface-1'], 0.5)}; }
#topmostdiv .bom tr.highlighted:nth-child(n) { background-color: #${mix(c.accent, c['surface-1'], 0.3)}; }
#topmostdiv .bom tr.checked { color: #${c.ok}; }
#topmostdiv .searchbox, #topmostdiv .menu-textbox, #topmostdiv input[type=text]:focus {
  background-color: #${c['surface-0']};
  color: #${c['text-primary']};
  border-color: #${c['border-strong']};
}
#topmostdiv input[type=text]:focus { border-color: #${c.accent}; }
#topmostdiv .searchbox::placeholder { color: #${c['text-muted']}; }
#topmostdiv mark.highlight { background-color: #${c.accent}; color: #${c['on-accent']}; }
#topmostdiv .gutter { background-color: #${c['border-strong']}; }
#topmostdiv #topdivider { border-bottom-color: #${c['border-strong']}; }
#topmostdiv #toptoggle { background-color: #${c['surface-2']}; border-color: #${c['border-strong']}; }
#topmostdiv .menu-content { background-color: #${c['surface-2']}; color: #${c['text-primary']}; }
#topmostdiv .menu-label { border-color: #${c['border-subtle']}; }
#topmostdiv a { color: #${c.accent}; }
#topmostdiv button { border-color: #${inv(c['border-strong'])}; }
#topmostdiv .button-container button { background-color: #${inv(c['surface-2'])}; }
#topmostdiv .button-container button.depressed { background-color: #${inv(c.accent)}; }
#topmostdiv .menubtn, #topmostdiv .statsbtn, #topmostdiv .iobtn, #topmostdiv .visbtn { background-color: #${inv(c['surface-1'])}; }
#topmostdiv .menu:hover .menubtn, #topmostdiv .menu:hover .statsbtn, #topmostdiv .menu:hover .iobtn { background-color: #${inv(c['surface-3'])}; }
#topmostdiv .savebtn { background-color: #${inv(c['surface-3'])}; color: #${inv(c['text-primary'])}; }
#topmostdiv .slider::-webkit-slider-thumb { background: #${c.accent}; }
#topmostdiv .slider::-moz-range-thumb { background: #${c.accent}; }
#topmostdiv #checkbox-stats .bar { background-color: #${c.ok}99; }
::-webkit-scrollbar-track { background: #${c['surface-1']}; }
::-webkit-scrollbar-thumb { background: #${c['border-strong']}; }
::-webkit-scrollbar-thumb:hover { background: #${c['text-muted']}; }
`;
}

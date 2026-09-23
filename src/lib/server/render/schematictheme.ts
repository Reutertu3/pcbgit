/**
 * Dark look for schematic SVGs. kicad-cli always plots with KiCad's default
 * schematic theme, which writes literal colours into the SVG, so the dark look
 * is those colours swapped for Gruvbox Dark. Works on every existing render.
 */

/** KiCad default schematic colour → Gruvbox Dark. Unlisted colours pass through. */
const GRUVBOX_DARK: Record<string, string> = {
	f5f4ef: '282828', // background
	'000000': 'ebdbb2', // default text and lines
	'0f0f0f': 'ebdbb2', // local labels
	'009600': 'b8bb26', // wires, junctions
	'000084': '83a598', // buses
	'840000': 'fb4934', // symbol outlines, fields, sheets, global labels, drawing sheet
	a90000: 'fe8019', // pins, pin numbers
	'006464': '8ec07c', // references, values, pin names, sheet names
	'004848': '689d6a', // net names
	'725600': 'fabd2f', // hierarchical labels, sheet files
	'0000c2': 'd3869b', // notes, no-connects
	ffffc2: '3c3836', // symbol body fill
	cc6600: 'fe8019' // ERC warnings
};

export function darkSchematicSvg(svg: string) {
	return svg.replace(/#([0-9a-f]{6})\b/gi, (match, hex: string) => {
		const mapped = GRUVBOX_DARK[hex.toLowerCase()];
		return mapped ? `#${mapped}` : match;
	});
}

/** kicad-cli sheet exports, as stored by the render worker. */
export function isSchematicSheet(file: string) {
	return /(^|\/)sheet-\d+\.svg$/.test(file);
}

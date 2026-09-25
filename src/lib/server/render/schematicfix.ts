/**
 * Changes to a schematic before kicad-cli exports it, for things its plotter draws
 * differently from KiCad's editor. No `$lib` imports (see render/kicad.ts).
 */

/**
 * A fill "with colour" whose colour is fully transparent (alpha 0). KiCad's editor
 * draws nothing, but its plotter (SVG and PDF) takes the colour as unset and fills
 * the shape with the outline colour: a text box used as a symbol body became a
 * solid dark red block. Written by KiCad on one line or spread over several.
 */
const TRANSPARENT_FILL = /\(fill\s*\(type\s+color\)\s*\(color\s+\d+\s+\d+\s+\d+\s+0(?:\.0+)?\)\s*\)/g;

/** The schematic with transparent colour fills turned into no fill, and how many there were. */
export function clearTransparentFills(text: string) {
	let count = 0;
	const fixed = text.replace(TRANSPARENT_FILL, () => {
		count++;
		return '(fill (type none))';
	});
	return { text: fixed, count };
}

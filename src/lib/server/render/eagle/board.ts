/**
 * Clean-up of a board that kicad-cli imported from Eagle. Items on Eagle layers
 * without a KiCad counterpart (dimensions, documentation) come out on "UNDEFINED",
 * and KiCad then refuses to load the board at all; they move to a drawing layer.
 * No `$lib` imports (see render/kicad.ts).
 */
export function fixImportedEagleBoard(text: string) {
	let moved = 0;
	const fixed = text.replace(/\(layer "UNDEFINED"\)/g, () => {
		moved++;
		return '(layer "Dwgs.User")';
	});
	return { text: fixed, moved };
}

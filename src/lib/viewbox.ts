/** Parses an SVG viewBox into a content box, with a sane fallback. */
export function parseViewBox(viewBox: string | null | undefined, fallback = { width: 1000, height: 750 }) {
	if (!viewBox) return fallback;
	const parts = viewBox.trim().split(/[\s,]+/).map(Number);
	if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return fallback;
	const [minX, minY, width, height] = parts;
	if (width <= 0 || height <= 0) return fallback;
	return { minX, minY, width, height };
}

/** The union of several viewBoxes, so stacked layers share one coordinate space. */
export function unionViewBox(viewBoxes: (string | null | undefined)[]) {
	const boxes = viewBoxes
		.map((vb) => parseViewBox(vb, { width: 0, height: 0 }))
		.filter((box) => box.width > 0 && box.height > 0) as {
		minX?: number;
		minY?: number;
		width: number;
		height: number;
	}[];
	if (!boxes.length) return { minX: 0, minY: 0, width: 1000, height: 750 };

	const minX = Math.min(...boxes.map((box) => box.minX ?? 0));
	const minY = Math.min(...boxes.map((box) => box.minY ?? 0));
	const maxX = Math.max(...boxes.map((box) => (box.minX ?? 0) + box.width));
	const maxY = Math.max(...boxes.map((box) => (box.minY ?? 0) + box.height));
	return { minX, minY, width: maxX - minX, height: maxY - minY };
}

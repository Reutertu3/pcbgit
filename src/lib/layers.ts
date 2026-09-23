/** Presentation metadata for KiCad board layers. Shared by the server and the 2D viewer. */

export interface LayerStyle {
	/** Canonical KiCad layer name as it appears in the .kicad_pcb file. */
	id: string;
	label: string;
	group: 'copper' | 'silkscreen' | 'mask' | 'paste' | 'outline' | 'fabrication';
	side: 'front' | 'back' | 'both';
	color: string;
	/** Whether the layer starts visible in the viewer. */
	defaultOn: boolean;
	order: number;
}

const BASE: LayerStyle[] = [
	{ id: 'Edge.Cuts', label: 'Board outline', group: 'outline', side: 'both', color: '#d0d2d5', defaultOn: true, order: 100 },
	{ id: 'F.Cu', label: 'Front copper', group: 'copper', side: 'front', color: '#c83434', defaultOn: true, order: 10 },
	{ id: 'B.Cu', label: 'Back copper', group: 'copper', side: 'back', color: '#4d7fc4', defaultOn: true, order: 11 },
	{ id: 'F.SilkS', label: 'Front silkscreen', group: 'silkscreen', side: 'front', color: '#f0f0f0', defaultOn: true, order: 30 },
	{ id: 'B.SilkS', label: 'Back silkscreen', group: 'silkscreen', side: 'back', color: '#e0c0c0', defaultOn: false, order: 31 },
	{ id: 'F.Mask', label: 'Front soldermask', group: 'mask', side: 'front', color: '#a000a0', defaultOn: false, order: 40 },
	{ id: 'B.Mask', label: 'Back soldermask', group: 'mask', side: 'back', color: '#8000a0', defaultOn: false, order: 41 },
	{ id: 'F.Paste', label: 'Front paste', group: 'paste', side: 'front', color: '#b0b0b0', defaultOn: false, order: 50 },
	{ id: 'B.Paste', label: 'Back paste', group: 'paste', side: 'back', color: '#909090', defaultOn: false, order: 51 },
	{ id: 'F.Fab', label: 'Front fabrication', group: 'fabrication', side: 'front', color: '#c2b280', defaultOn: false, order: 60 },
	{ id: 'B.Fab', label: 'Back fabrication', group: 'fabrication', side: 'back', color: '#a08c5a', defaultOn: false, order: 61 },
	{ id: 'F.CrtYd', label: 'Front courtyard', group: 'fabrication', side: 'front', color: '#d060d0', defaultOn: false, order: 70 },
	{ id: 'B.CrtYd', label: 'Back courtyard', group: 'fabrication', side: 'back', color: '#a040a0', defaultOn: false, order: 71 },
	{ id: 'User.Comments', label: 'Comments', group: 'fabrication', side: 'both', color: '#78c878', defaultOn: false, order: 80 }
];

/** Board files use canonical names; KiCad's plot output uses the user-facing ones. */
const ALIASES: Record<string, string> = {
	'F.SilkS': 'F.Silkscreen',
	'B.SilkS': 'B.Silkscreen',
	'F.CrtYd': 'F.Courtyard',
	'B.CrtYd': 'B.Courtyard',
	'F.Adhes': 'F.Adhesive',
	'B.Adhes': 'B.Adhesive',
	'Cmts.User': 'User.Comments',
	'Dwgs.User': 'User.Drawings'
};

const INNER_COLORS = ['#c2c200', '#3fc43f', '#c47fc4', '#3fc4c4', '#c4823f', '#7f7fc4'];

const byId = new Map(BASE.map((layer) => [layer.id, layer]));

/** Inner copper layers are numbered, so they are generated rather than listed. */
export function layerStyle(id: string): LayerStyle {
	const known = byId.get(id);
	if (known) return known;
	const aliased = byId.get(ALIASES[id]);
	if (aliased) return { ...aliased, id };

	const inner = /^In(\d+)\.Cu$/.exec(id);
	if (inner) {
		const index = Number(inner[1]);
		return {
			id,
			label: `Inner copper ${index}`,
			group: 'copper',
			side: 'both',
			color: INNER_COLORS[(index - 1) % INNER_COLORS.length],
			defaultOn: true,
			order: 10 + index / 100
		};
	}

	return { id, label: id, group: 'fabrication', side: 'both', color: '#8a8f98', defaultOn: false, order: 200 };
}

/** Layers worth exporting, in the order they should stack in the viewer. */
export function exportableLayers(boardLayerNames: string[]) {
	const wanted = new Set([...BASE.map((l) => l.id), 'User.Drawings', 'Cmts.User']);
	return boardLayerNames
		.filter((name) => wanted.has(name) || /^In\d+\.Cu$/.test(name))
		.sort((a, b) => layerStyle(a).order - layerStyle(b).order);
}

/**
 * Layers a board house makes the board from: copper (inner layers in stack order),
 * paste, silkscreen, mask and the outline. Courtyard, fab and user layers stay out.
 */
export function fabricationLayers(boardLayerNames: string[]) {
	const inner = boardLayerNames
		.filter((name) => /^In\d+\.Cu$/.test(name))
		.sort((a, b) => Number(a.slice(2, -3)) - Number(b.slice(2, -3)));
	return ['F.Cu', ...inner, 'B.Cu', 'F.Paste', 'B.Paste', 'F.SilkS', 'B.SilkS', 'F.Mask', 'B.Mask', 'Edge.Cuts'].filter((name) =>
		boardLayerNames.includes(name)
	);
}

/** Layer set for the composite board preview image. */
export function previewLayers(boardLayerNames: string[], side: 'front' | 'back') {
	const prefix = side === 'front' ? 'F' : 'B';
	return [`${prefix}.Cu`, `${prefix}.Mask`, `${prefix}.SilkS`, 'Edge.Cuts'].filter((name) =>
		boardLayerNames.includes(name)
	);
}

/** kicad-cli names layer files by replacing '.' with '_'; map back to the layer id. */
export function layerIdFromFilename(filename: string, boardLayerNames: string[], userNames: Record<string, string> = {}) {
	const stem = filename.replace(/\.svg$/i, '');
	const matches = (candidate: string) => {
		// kicad-cli puts the layer name in the file name with "." and characters
		// that are illegal in file names replaced by "_"; spaces stay.
		const slug = candidate.replace(/[.\\/:*?"<>|]/g, '_');
		return stem === slug || stem.endsWith(`-${slug}`) || stem.endsWith(`_${slug}`);
	};
	// A layer renamed in the board setup ("Front" for F.Cu) is plotted under that
	// name, so those are tried first.
	for (const name of boardLayerNames) {
		if (userNames[name] && matches(userNames[name])) return name;
	}
	for (const name of boardLayerNames) {
		for (const candidate of [name, ALIASES[name]].filter(Boolean)) {
			if (matches(candidate)) return name;
		}
	}
	return null;
}

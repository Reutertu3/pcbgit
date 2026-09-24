import fs from 'node:fs';
import { child, children, descendants, isList, parseSexpr, prop, type SNode } from './sexpr';

export interface BoardLayer {
	id: number;
	name: string;
	type: string;
	copper: boolean;
	/** The name given in the board setup ("Front" for F.Cu); kicad-cli uses it in file names and reports. */
	userName?: string;
}

export type Mount = 'smd' | 'tht' | 'other';

export interface BoardStats {
	title: string;
	layers: BoardLayer[];
	copperLayers: number;
	netCount: number;
	footprintCount: number;
	/** Reference designator -> mounting type, used by the 3D viewer's SMD/THT toggles. */
	mounts: Record<string, Mount>;
	padCount: number;
	viaCount: number;
	trackCount: number;
	smdCount: number;
	throughHoleCount: number;
	widthMm: number | null;
	heightMm: number | null;
	/** Board outline bounding box in board coordinates, for overlaying DRC markers. */
	bbox: { minX: number; minY: number; maxX: number; maxY: number } | null;
}

const COPPER = /^(F|B|In\d+)\.Cu$/;

export function analyzeBoard(pcbPath: string): BoardStats {
	return analyzeBoardText(fs.readFileSync(pcbPath, 'utf8'));
}

export function analyzeBoardText(text: string): BoardStats {
	const tree = parseSexpr(text);
	const root = (tree.find((n) => isList(n) && n[0] === 'kicad_pcb') as SNode[]) ?? [];

	const layers: BoardLayer[] = [];
	const layersNode = child(root, 'layers');
	if (layersNode) {
		for (const entry of layersNode.slice(1)) {
			if (!isList(entry)) continue;
			const [id, name, type, userName] = entry as string[];
			if (typeof name !== 'string') continue;
			layers.push({
				id: Number(id),
				name,
				type: typeof type === 'string' ? type : 'user',
				copper: COPPER.test(name),
				...(typeof userName === 'string' && userName !== name ? { userName } : {})
			});
		}
	}

	const nets = children(root, 'net').filter((n) => n[1] !== '0');
	const footprints = children(root, 'footprint');

	let smdCount = 0;
	let throughHoleCount = 0;
	let padCount = 0;
	for (const fp of footprints) {
		const attr = child(fp, 'attr');
		const flags = (attr?.slice(1) ?? []).filter((v): v is string => typeof v === 'string');
		if (flags.includes('smd')) smdCount++;
		else if (flags.includes('through_hole')) throughHoleCount++;
		padCount += children(fp, 'pad').length;
	}

	const bbox = edgeCutsBounds(root);
	const titleBlock = child(root, 'title_block');

	return {
		title: (titleBlock && prop(titleBlock, 'title')) || '',
		layers,
		copperLayers: layers.filter((l) => l.copper).length,
		netCount: nets.length,
		footprintCount: footprints.length,
		mounts: footprintMounts(footprints),
		padCount,
		viaCount: children(root, 'via').length,
		trackCount: children(root, 'segment').length + children(root, 'arc').length,
		smdCount,
		throughHoleCount,
		widthMm: bbox ? round(bbox.maxX - bbox.minX) : null,
		heightMm: bbox ? round(bbox.maxY - bbox.minY) : null,
		bbox
	};
}

function round(value: number) {
	return Math.round(value * 100) / 100;
}

/** Bounding box of everything drawn on Edge.Cuts, which is the board outline. */
function edgeCutsBounds(root: SNode[]) {
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;

	const add = (x: number, y: number) => {
		if (!Number.isFinite(x) || !Number.isFinite(y)) return;
		minX = Math.min(minX, x);
		minY = Math.min(minY, y);
		maxX = Math.max(maxX, x);
		maxY = Math.max(maxY, y);
	};

	// Outline shapes on the board, and inside footprints (an outline drawn as a part,
	// as Eagle projects often do), moved and rotated like their footprint.
	const collect = (parent: SNode[], prefix: 'gr' | 'fp', place: (x: number, y: number) => void) => {
		const points = (node: SNode[], key: string) => {
			const found = child(node, key);
			if (found) place(Number(found[1]), Number(found[2]));
		};
		for (const kind of ['line', 'rect', 'arc', 'circle', 'poly', 'curve']) {
			for (const shape of children(parent, `${prefix}_${kind}`)) {
				if (prop(shape, 'layer') !== 'Edge.Cuts') continue;
				points(shape, 'start');
				points(shape, 'end');
				points(shape, 'mid');
				points(shape, 'center');
				for (const pts of descendants(shape, 'pts')) {
					for (const xy of children(pts, 'xy')) place(Number(xy[1]), Number(xy[2]));
				}
				// A circle's radius is implied by its center/end pair, already covered above.
			}
		}
	};
	collect(root, 'gr', add);
	for (const footprint of children(root, 'footprint')) {
		const at = child(footprint, 'at');
		const [fx, fy, angle] = [Number(at?.[1] ?? 0), Number(at?.[2] ?? 0), Number(at?.[3] ?? 0)];
		const a = (angle * Math.PI) / 180;
		// KiCad rotates counter-clockwise on screen, with y pointing down.
		collect(footprint, 'fp', (x, y) => add(fx + x * Math.cos(a) + y * Math.sin(a), fy - x * Math.sin(a) + y * Math.cos(a)));
	}

	if (!Number.isFinite(minX)) return null;
	return { minX: round(minX), minY: round(minY), maxX: round(maxX), maxY: round(maxY) };
}

/** KiCad 8+ stores the reference as a property; older files use fp_text. */
function footprintReference(fp: SNode[]) {
	for (const property of children(fp, 'property')) {
		if (property[1] === 'Reference' && typeof property[2] === 'string') return property[2];
	}
	for (const text of children(fp, 'fp_text')) {
		if (text[1] === 'reference' && typeof text[2] === 'string') return text[2];
	}
	return null;
}

function footprintMounts(footprints: SNode[][]) {
	const mounts: Record<string, Mount> = {};
	for (const fp of footprints) {
		const reference = footprintReference(fp);
		if (!reference) continue;
		const flags = (child(fp, 'attr')?.slice(1) ?? []).filter((v): v is string => typeof v === 'string');
		mounts[reference] = flags.includes('smd') ? 'smd' : flags.includes('through_hole') ? 'tht' : 'other';
	}
	return mounts;
}

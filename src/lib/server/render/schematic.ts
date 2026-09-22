import fs from 'node:fs';
import path from 'node:path';
import { child, children, isList, parseSexpr, prop, type SNode } from './sexpr';

export interface SchSymbol {
	reference: string;
	value: string;
	footprint: string;
	datasheet: string;
	description: string;
	mpn: string;
	dnp: boolean;
	excludeFromBom: boolean;
	sheet: string;
}

export interface SchematicStats {
	title: string;
	sheets: { name: string; file: string }[];
	symbols: SchSymbol[];
}

const MPN_KEYS = ['mpn', 'manufacturer part number', 'part number', 'pn', 'lcsc', 'digikey', 'mouser'];

/** Reads the root sheet plus every hierarchical sub-sheet it references. */
export function analyzeSchematic(rootSchPath: string): SchematicStats {
	const visited = new Set<string>();
	const symbols: SchSymbol[] = [];
	const sheets: { name: string; file: string }[] = [];
	let title = '';

	const read = (filePath: string, sheetName: string) => {
		const resolved = path.resolve(filePath);
		if (visited.has(resolved) || !fs.existsSync(resolved)) return;
		visited.add(resolved);

		const tree = parseSexpr(fs.readFileSync(resolved, 'utf8'));
		const root = (tree.find((n) => isList(n) && n[0] === 'kicad_sch') as SNode[]) ?? [];

		const titleBlock = child(root, 'title_block');
		if (!title && titleBlock) title = prop(titleBlock, 'title') ?? '';
		sheets.push({ name: sheetName, file: resolved });

		for (const symbol of children(root, 'symbol')) {
			const parsed = readSymbol(symbol, sheetName);
			if (parsed) symbols.push(parsed);
		}

		// Recurse into hierarchical sheets, which name their file in a property.
		for (const sheet of children(root, 'sheet')) {
			const props = readProperties(sheet);
			const file = props['sheetfile'] ?? props['sheet file'];
			const name = props['sheetname'] ?? props['sheet name'] ?? file ?? 'sheet';
			if (file) read(path.join(path.dirname(resolved), file), name);
		}
	};

	read(rootSchPath, path.basename(rootSchPath, '.kicad_sch'));
	symbols.sort((a, b) => naturalRef(a.reference).localeCompare(naturalRef(b.reference)));
	return { title, sheets, symbols };
}

function readProperties(node: SNode[]) {
	const out: Record<string, string> = {};
	for (const property of children(node, 'property')) {
		const key = property[1];
		const value = property[2];
		if (typeof key === 'string' && typeof value === 'string') out[key.toLowerCase()] = value;
	}
	return out;
}

function readSymbol(symbol: SNode[], sheet: string): SchSymbol | null {
	const props = readProperties(symbol);
	const reference = props['reference'] ?? '';
	// Power symbols and graphics carry a '#' reference and never belong in a BOM.
	if (!reference || reference.startsWith('#')) return null;

	const mpnKey = Object.keys(props).find((k) => MPN_KEYS.includes(k));

	return {
		reference,
		value: props['value'] ?? '',
		footprint: props['footprint'] ?? '',
		datasheet: props['datasheet'] === '~' ? '' : (props['datasheet'] ?? ''),
		description: props['description'] ?? '',
		mpn: mpnKey ? props[mpnKey] : '',
		dnp: prop(symbol, 'dnp') === 'yes',
		excludeFromBom: prop(symbol, 'exclude_from_sim') === 'never' ? false : prop(symbol, 'in_bom') === 'no',
		sheet
	};
}

/** Sorts R2 before R10 rather than lexically. */
function naturalRef(reference: string) {
	return reference.replace(/\d+/g, (d) => d.padStart(6, '0'));
}

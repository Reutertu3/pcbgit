import type { SchSymbol } from './schematic';

export interface BomLine {
	refs: string;
	value: string;
	footprint: string;
	quantity: number;
	datasheet: string;
	description: string;
	mpn: string;
	dnp: boolean;
}

/** Collapses individual symbols into BOM lines grouped by value + footprint + MPN. */
export function groupBom(symbols: SchSymbol[]): BomLine[] {
	const groups = new Map<string, { line: BomLine; refs: string[] }>();

	for (const symbol of symbols) {
		if (symbol.excludeFromBom) continue;
		const key = [symbol.value, symbol.footprint, symbol.mpn, symbol.dnp].join('\u001f');
		let group = groups.get(key);
		if (!group) {
			group = {
				line: {
					refs: '',
					value: symbol.value,
					footprint: shortFootprint(symbol.footprint),
					quantity: 0,
					datasheet: symbol.datasheet,
					description: symbol.description,
					mpn: symbol.mpn,
					dnp: symbol.dnp
				},
				refs: []
			};
			groups.set(key, group);
		}
		group.line.quantity++;
		group.refs.push(symbol.reference);
		if (!group.line.datasheet) group.line.datasheet = symbol.datasheet;
		if (!group.line.description) group.line.description = symbol.description;
	}

	return [...groups.values()]
		.map(({ line, refs }) => ({ ...line, refs: collapseRefs(refs) }))
		.sort((a, b) => a.refs.localeCompare(b.refs, undefined, { numeric: true }));
}

/** "Library:Name" -> "Name"; the library prefix is noise in a table. */
function shortFootprint(footprint: string) {
	const idx = footprint.indexOf(':');
	return idx === -1 ? footprint : footprint.slice(idx + 1);
}

/** R1, R2, R3, R7 -> "R1-R3, R7" */
export function collapseRefs(refs: string[]) {
	const parsed = refs
		.map((ref) => {
			const match = /^([A-Za-z_]+)(\d+)$/.exec(ref);
			return match ? { prefix: match[1], num: Number(match[2]), raw: ref } : null;
		})
		.filter((r): r is { prefix: string; num: number; raw: string } => r !== null)
		.sort((a, b) => a.prefix.localeCompare(b.prefix) || a.num - b.num);

	const unparsed = refs.filter((r) => !/^([A-Za-z_]+)(\d+)$/.test(r)).sort();

	const parts: string[] = [];
	let run: typeof parsed = [];

	const flush = () => {
		if (run.length === 0) return;
		const first = run[0];
		const last = run[run.length - 1];
		parts.push(run.length > 2 ? `${first.raw}-${last.raw}` : run.map((r) => r.raw).join(', '));
		run = [];
	};

	for (const ref of parsed) {
		const previous = run[run.length - 1];
		if (previous && previous.prefix === ref.prefix && ref.num === previous.num + 1) run.push(ref);
		else {
			flush();
			run = [ref];
		}
	}
	flush();

	return [...parts, ...unparsed].join(', ');
}

/** Parses a kicad-cli BOM CSV export into BOM lines. */
export function parseBomCsv(csv: string): BomLine[] {
	const rows = parseCsv(csv);
	if (rows.length < 2) return [];

	const header = rows[0].map((h) => h.trim().toLowerCase());
	const col = (...names: string[]) => {
		for (const name of names) {
			const idx = header.indexOf(name);
			if (idx !== -1) return idx;
		}
		return -1;
	};

	const idx = {
		refs: col('reference', 'references', 'designator', 'refs'),
		value: col('value'),
		footprint: col('footprint', 'footprints'),
		qty: col('qty', 'quantity', 'count'),
		datasheet: col('datasheet'),
		description: col('description', 'desc'),
		mpn: col('mpn', 'manufacturer part number', 'part number'),
		dnp: col('dnp', 'do not populate')
	};

	const at = (row: string[], i: number) => (i === -1 ? '' : (row[i] ?? '').trim());

	return rows
		.slice(1)
		.filter((row) => row.some((cell) => cell.trim()))
		.map((row) => {
			const refs = at(row, idx.refs);
			const qty = Number(at(row, idx.qty));
			return {
				refs,
				value: at(row, idx.value),
				footprint: shortFootprint(at(row, idx.footprint)),
				quantity: Number.isFinite(qty) && qty > 0 ? qty : countRefs(refs),
				datasheet: at(row, idx.datasheet).replace(/^~$/, ''),
				description: at(row, idx.description),
				mpn: at(row, idx.mpn),
				dnp: /^(1|yes|true|dnp)$/i.test(at(row, idx.dnp))
			};
		});
}

function countRefs(refs: string) {
	return refs.split(/[,\s]+/).filter(Boolean).length || 1;
}

/** RFC4180-ish CSV reader: handles quoted fields, embedded commas and newlines. */
export function parseCsv(text: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let field = '';
	let quoted = false;

	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		if (quoted) {
			if (ch === '"') {
				if (text[i + 1] === '"') {
					field += '"';
					i++;
				} else quoted = false;
			} else field += ch;
		} else if (ch === '"') quoted = true;
		else if (ch === ',' || ch === ';') {
			row.push(field);
			field = '';
		} else if (ch === '\n') {
			row.push(field);
			rows.push(row);
			row = [];
			field = '';
		} else if (ch !== '\r') field += ch;
	}
	if (field || row.length) {
		row.push(field);
		rows.push(row);
	}
	return rows;
}

export function bomToCsv(lines: BomLine[]) {
	const escape = (value: string | number) => {
		const str = String(value ?? '');
		return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
	};
	const header = ['Reference', 'Qty', 'Value', 'Footprint', 'MPN', 'Description', 'Datasheet', 'DNP'];
	const body = lines.map((line) =>
		[line.refs, line.quantity, line.value, line.footprint, line.mpn, line.description, line.datasheet, line.dnp ? 'DNP' : '']
			.map(escape)
			.join(',')
	);
	return [header.join(','), ...body].join('\n') + '\n';
}

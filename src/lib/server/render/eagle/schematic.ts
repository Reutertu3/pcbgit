/**
 * Eagle (6 and newer) schematic → KiCad schematic files, so kicad-cli can render
 * Eagle projects like native ones. An Eagle .sch embeds every symbol it uses, so
 * nothing outside the file is needed.
 *
 * Mapping rules follow KiCad's own Eagle importer (sch_io_eagle.cpp) where it
 * matters for the look, notably field alignment. The input is untrusted: every
 * number is checked and clamped, every string escaped for KiCad's S-expressions,
 * and output file names never come from the input.
 *
 * No `$lib` imports: this runs in the renderer with plain Node (see render/kicad.ts).
 */
import { XmlError, child, children, parseXml, type XmlElement } from './xml.ts';

export class EagleConvertError extends Error {}

/** File stem of the converted project: board.kicad_sch, board.kicad_pcb, … */
export const CONVERTED_STEM = 'board';

export interface ConvertedFile {
	name: string;
	content: string;
}

export interface ConvertedSchematic {
	/** The root sheet first; with several Eagle sheets, the root is an index page. */
	files: ConvertedFile[];
	version: string;
	sheets: number;
	parts: number;
}

/** Coordinates beyond this (mm) are not a real drawing; they are clamped. */
const MAX_COORD = 5000;
const MAX_SHEETS = 100;
const PIN_LENGTH: Record<string, number> = { point: 0, short: 2.54, middle: 5.08, long: 7.62 };
const PIN_TYPE: Record<string, string> = {
	in: 'input', out: 'output', io: 'bidirectional', oc: 'open_collector', hiz: 'tri_state',
	pas: 'passive', pwr: 'power_in', sup: 'power_in', nc: 'no_connect'
};
/** KiCad's own fields; Eagle attributes with these names get a prefix. */
const RESERVED_FIELDS = new Set(['REFERENCE', 'VALUE', 'FOOTPRINT', 'DATASHEET', 'DESCRIPTION', 'MPN', 'SHEETNAME', 'SHEETFILE']);

/* ------------------------------------------------------------------ helpers */

function num(value: string | undefined, fallback = 0) {
	if (value === undefined) return fallback;
	const n = Number(value);
	if (!Number.isFinite(n)) return fallback;
	return Math.max(-MAX_COORD, Math.min(MAX_COORD, n));
}

/** A string for KiCad's S-expressions: quoted and escaped, control characters dropped. */
function q(value: string) {
	const clean = value.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').slice(0, 2000);
	return `"${clean.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '\\n').replace(/\t/g, ' ')}"`;
}

const fmt = (n: number) => String(Math.round(n * 10000) / 10000);

let uuidCounter = 0;
/** Deterministic ids: the same input gives the same output, which keeps test files stable. */
function makeUuid(seed: string) {
	let h = 2166136261 ^ uuidCounter++;
	for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
	const hex = (n: number) => (n >>> 0).toString(16).padStart(8, '0');
	const a = hex(h), b = hex(Math.imul(h, 2654435761)), c = hex(Math.imul(h ^ 0x5bd1e995, 40503)), d = hex(uuidCounter * 2246822519);
	return `${a}-${b.slice(0, 4)}-4${b.slice(5, 8)}-8${c.slice(1, 4)}-${c.slice(4)}${d}`;
}

function effects(size: number, opts: { hide?: boolean; justify?: string } = {}) {
	const s = fmt(Math.max(0.1, Math.min(50, size)));
	return `(effects (font (size ${s} ${s}))${opts.justify ? ` (justify ${opts.justify})` : ''}${opts.hide ? ' (hide yes)' : ''})`;
}

/** Eagle rotation "[M][S]R<deg>" → mirror flag and a right angle. */
function rotation(value?: string) {
	const m = /^(M?)(S?)R(\d+(?:\.\d+)?)$/.exec(value ?? 'R0');
	const angle = m ? (Math.round(Number(m[3]) / 90) * 90) % 360 : 0;
	return { mirror: Boolean(m?.[1]), angle };
}

const opposite = (s: string) => ({ left: 'right', right: 'left', top: 'bottom', bottom: 'top' })[s] ?? s;

function splitAlign(align?: string) {
	const a = align ?? 'bottom-left';
	if (a === 'center') return { v: 'center', h: 'center' };
	if (!a.includes('-')) return { v: 'bottom', h: a };
	const [v, h] = a.split('-');
	return { v, h };
}

function justifyOf(v: string, h: string) {
	return [h === 'center' ? '' : h, v === 'center' ? '' : v].filter(Boolean).join(' ');
}

/** Free text: Eagle keeps it readable, so 180°/270° turn upright around the opposite corner. */
function textPlacement(align: string | undefined, angle: number) {
	let { v, h } = splitAlign(align);
	if (angle === 180 || angle === 270) {
		v = opposite(v);
		h = opposite(h);
		angle -= 180;
	}
	return { angle, justify: justifyOf(v, h) };
}

/**
 * A symbol field, as KiCad's importer places it (eagleToKicadAlignment): the angle
 * relative to the symbol, upside-down text turned upright, mirroring flipping sides.
 */
function fieldPlacement(align: string | undefined, relDeg: number, absDeg: number, mirror: boolean) {
	let { v, h } = splitAlign(align);
	let angle = 0;
	if (relDeg === 90) angle = 90;
	else if (relDeg === 180) [v, h] = [opposite(v), opposite(h)];
	else if (relDeg === 270) {
		angle = 90;
		[v, h] = [opposite(v), opposite(h)];
	}
	if (mirror) {
		if (absDeg === 90 || absDeg === 270) v = opposite(v);
		else h = opposite(h);
	}
	return { angle, justify: justifyOf(v, h) };
}

function stroke(width: number, style?: string) {
	const type = style === 'longdash' || style === 'shortdash' ? 'dash' : style === 'dashdot' ? 'dash_dot' : 'default';
	return `(stroke (width ${fmt(Math.max(0, width))}) (type ${type}))`;
}

/** The midpoint of an Eagle arc: from p1 to p2, counter-clockwise by `curve` degrees. */
function arcMid(x1: number, y1: number, x2: number, y2: number, curve: number) {
	const a = (curve * Math.PI) / 180;
	const chord = Math.hypot(x2 - x1, y2 - y1);
	if (chord < 1e-6 || Math.abs(Math.sin(a / 2)) < 1e-6) return null;
	const r = chord / 2 / Math.sin(a / 2);
	const h = r * Math.cos(a / 2);
	const cx = (x1 + x2) / 2 - ((y2 - y1) / chord) * h;
	const cy = (y1 + y2) / 2 + ((x2 - x1) / chord) * h;
	const mid = Math.atan2(y1 - cy, x1 - cx) + a / 2;
	return { x: cx + Math.abs(r) * Math.cos(mid), y: cy + Math.abs(r) * Math.sin(mid) };
}

type Transform = { x: (v: number) => number; y: (v: number) => number };
const IDENTITY: Transform = { x: (v) => v, y: (v) => v };

/** Lines, arcs, circles, rectangles and polygons, in symbol space or on the sheet. */
function drawing(e: XmlElement, t: Transform, onSheet: boolean): string | null {
	const a = e.attrs;
	const fill = (filled: boolean) => `(fill (type ${filled && !onSheet ? 'outline' : 'none'}))`;
	switch (e.tag) {
		case 'wire': {
			const [x1, y1, x2, y2] = [num(a.x1), num(a.y1), num(a.x2), num(a.y2)];
			const mid = a.curve ? arcMid(x1, y1, x2, y2, num(a.curve)) : null;
			if (mid) {
				return `(arc (start ${fmt(t.x(x1))} ${fmt(t.y(y1))}) (mid ${fmt(t.x(mid.x))} ${fmt(t.y(mid.y))}) (end ${fmt(t.x(x2))} ${fmt(t.y(y2))}) ${stroke(num(a.width))} (fill (type none)))`;
			}
			return `(polyline (pts (xy ${fmt(t.x(x1))} ${fmt(t.y(y1))}) (xy ${fmt(t.x(x2))} ${fmt(t.y(y2))})) ${stroke(num(a.width), a.style)} (fill (type none)))`;
		}
		case 'circle': {
			const width = num(a.width);
			return `(circle (center ${fmt(t.x(num(a.x)))} ${fmt(t.y(num(a.y)))}) (radius ${fmt(Math.abs(num(a.radius)))}) ${stroke(width)} ${fill(width === 0)})`;
		}
		case 'rectangle': {
			const [x1, y1, x2, y2] = [t.x(num(a.x1)), t.y(num(a.y1)), t.x(num(a.x2)), t.y(num(a.y2))];
			if (onSheet) {
				return `(polyline (pts (xy ${fmt(x1)} ${fmt(y1)}) (xy ${fmt(x2)} ${fmt(y1)}) (xy ${fmt(x2)} ${fmt(y2)}) (xy ${fmt(x1)} ${fmt(y2)}) (xy ${fmt(x1)} ${fmt(y1)})) ${stroke(0.254)} (fill (type none)))`;
			}
			return `(rectangle (start ${fmt(x1)} ${fmt(y1)}) (end ${fmt(x2)} ${fmt(y2)}) ${stroke(0)} ${fill(true)})`;
		}
		case 'polygon': {
			const points = children(e, 'vertex').map((v) => `(xy ${fmt(t.x(num(v.attrs.x)))} ${fmt(t.y(num(v.attrs.y)))})`);
			if (points.length < 2) return null;
			points.push(points[0]);
			return `(polyline (pts ${points.join(' ')}) ${stroke(num(a.width))} ${fill(true)})`;
		}
	}
	return null;
}

/** Eagle's drawing frame: two borders and the column/row ruler. */
function frame(e: XmlElement, t: Transform, text: (s: string, x: number, y: number) => string): string[] {
	const [x1, y1, x2, y2] = [num(e.attrs.x1), num(e.attrs.y1), num(e.attrs.x2), num(e.attrs.y2)];
	const cols = Math.max(1, Math.min(50, Math.round(num(e.attrs.columns, 1))));
	const rows = Math.max(1, Math.min(50, Math.round(num(e.attrs.rows, 1))));
	const b = 4.064;
	const line = (a: number, c: number, d: number, g: number) =>
		`(polyline (pts (xy ${fmt(t.x(a))} ${fmt(t.y(c))}) (xy ${fmt(t.x(d))} ${fmt(t.y(g))})) ${stroke(0.254)} (fill (type none)))`;
	const box = (a: number, c: number, d: number, g: number) => [line(a, c, d, c), line(d, c, d, g), line(d, g, a, g), line(a, g, a, c)];
	const out = [...box(x1, y1, x2, y2), ...box(x1 + b, y1 + b, x2 - b, y2 - b)];
	for (let i = 0; i < cols; i++) {
		const cx = x1 + ((x2 - x1) * (i + 0.5)) / cols;
		if (i) {
			const lx = x1 + ((x2 - x1) * i) / cols;
			out.push(line(lx, y1, lx, y1 + b), line(lx, y2, lx, y2 - b));
		}
		out.push(text(String(i + 1), cx, y1 + b / 2), text(String(i + 1), cx, y2 - b / 2));
	}
	for (let i = 0; i < rows; i++) {
		const cy = y2 - ((y2 - y1) * (i + 0.5)) / rows;
		if (i) {
			const ly = y2 - ((y2 - y1) * i) / rows;
			out.push(line(x1, ly, x1 + b, ly), line(x2, ly, x2 - b, ly));
		}
		const letter = String.fromCharCode(65 + i);
		out.push(text(letter, x1 + b / 2, cy), text(letter, x2 - b / 2, cy));
	}
	return out;
}

/** A name KiCad accepts inside a library id. */
function idSafe(value: string) {
	return value.replace(/[^A-Za-z0-9_.+-]/g, '_').slice(0, 100) || '_';
}

/** Eagle's default value: the device set name with its technology and package variant. */
function defaultValue(deviceset: string, device: string, technology: string) {
	let name = deviceset.includes('*') ? deviceset.replace('*', technology) : deviceset;
	name = name.includes('?') ? name.replace('?', device) : name + device;
	return name;
}

const stripHtml = (s: string) => s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);

/* --------------------------------------------------------------- conversion */

interface Library {
	symbols: Map<string, XmlElement>;
	devicesets: Map<string, XmlElement>;
}

interface LibSymbol {
	id: string;
	sexpr: string;
	power: boolean;
	/** Per gate: the unit number and the Eagle symbol. */
	gates: Map<string, { unit: number; symbol: XmlElement }>;
	/** Eagle devices without a package (frames, supply symbols) are not parts: no BOM, no board. */
	physical: boolean;
}

/**
 * Converts one Eagle schematic. `name` is the stem for the output files
 * ("board" → board.kicad_sch, board-sheet02.kicad_sch, …); `drawingName` is what
 * Eagle's >DRAWING_NAME shows, normally the original file name.
 */
export function convertEagleSchematic(xml: string, name: string, drawingName: string): ConvertedSchematic {
	uuidCounter = 0;
	let doc: XmlElement;
	try {
		doc = parseXml(xml);
	} catch (error) {
		throw new EagleConvertError(error instanceof XmlError ? `not a readable Eagle file: ${error.message}` : String(error));
	}
	const eagle = child(doc, 'eagle');
	const schematic = child(child(eagle, 'drawing'), 'schematic');
	if (!eagle || !schematic) throw new EagleConvertError('not an Eagle schematic');
	const version = /^[\d.]+$/.test(eagle.attrs.version ?? '') ? eagle.attrs.version : '';
	if (version && Number(version.split('.')[0]) < 6) throw new EagleConvertError(`Eagle ${version} is not supported (6 or newer)`);

	const libraries = new Map<string, Library>();
	for (const lib of children(child(schematic, 'libraries'), 'library')) {
		libraries.set(lib.attrs.name ?? '', {
			symbols: new Map(children(child(lib, 'symbols'), 'symbol').map((s) => [s.attrs.name ?? '', s])),
			devicesets: new Map(children(child(lib, 'devicesets'), 'deviceset').map((d) => [d.attrs.name ?? '', d]))
		});
	}
	const parts = new Map(children(child(schematic, 'parts'), 'part').map((p) => [p.attrs.name ?? '', p]));
	const globalAttributes = new Map(children(child(schematic, 'attributes'), 'attribute').map((a) => [(a.attrs.name ?? '').toUpperCase(), a.attrs.value ?? '']));
	const sheets = children(child(schematic, 'sheets'), 'sheet');
	if (!sheets.length) throw new EagleConvertError('the schematic has no sheets');
	if (sheets.length > MAX_SHEETS) throw new EagleConvertError(`too many sheets (${sheets.length})`);

	/* ---- library symbols: one per (library, device set, device), one unit per gate ---- */
	const libSymbols = new Map<string, LibSymbol>();
	const usedIds = new Set<string>();

	function libSymbolFor(part: XmlElement): LibSymbol | null {
		const key = `${part.attrs.library}\u0000${part.attrs.deviceset}\u0000${part.attrs.device}`;
		const existing = libSymbols.get(key);
		if (existing) return existing;
		const lib = libraries.get(part.attrs.library ?? '');
		const deviceset = lib?.devicesets.get(part.attrs.deviceset ?? '');
		if (!lib || !deviceset) return null;
		const device = children(child(deviceset, 'devices'), 'device').find((d) => (d.attrs.name ?? '') === (part.attrs.device ?? ''));
		const pads = new Map(children(child(device, 'connects'), 'connect').map((c) => [`${c.attrs.gate}\u0000${c.attrs.pin}`, c.attrs.pad ?? '']));
		const gateElements = children(child(deviceset, 'gates'), 'gate');

		let base = `${idSafe(part.attrs.library ?? '')}_${idSafe(part.attrs.deviceset ?? '')}_${idSafe(part.attrs.device ?? '')}`;
		for (let i = 2; usedIds.has(base); i++) base = `${base}_${i}`;
		usedIds.add(base);
		const id = `eagle:${base}`;

		const allPins = gateElements.flatMap((g) => children(lib.symbols.get(g.attrs.symbol ?? ''), 'pin'));
		const power = allPins.length > 0 && allPins.every((p) => p.attrs.direction === 'sup');
		const physical = Boolean(device?.attrs.package) && !power;
		// KiCad hides pin numbers per symbol only; show them if any pin shows its pad.
		const showNumbers = allPins.some((p) => ['both', 'pad', undefined].includes(p.attrs.visible));

		const gates = new Map<string, { unit: number; symbol: XmlElement }>();
		const units: string[] = [];
		gateElements.forEach((gate, index) => {
			const symbol = lib.symbols.get(gate.attrs.symbol ?? '');
			if (!symbol) return;
			const unit = index + 1;
			gates.set(gate.attrs.name ?? '', { unit, symbol });
			const body: string[] = [];
			for (const e of symbol.children) {
				if (e.tag === 'pin') {
					const r = rotation(e.attrs.rot);
					const visible = e.attrs.visible ?? 'both';
					const pinName = (e.attrs.name ?? '').replace(/@\d+$/, '');
					const pad = pads.get(`${gate.attrs.name}\u0000${e.attrs.name}`) ?? '';
					const fn = e.attrs.function;
					const shape = fn === 'dot' ? 'inverted' : fn === 'clk' ? 'clock' : fn === 'dotclk' ? 'inverted_clock' : 'line';
					const shownName = visible === 'both' || visible === 'pin' ? pinName || '~' : '~';
					body.push(
						`(pin ${PIN_TYPE[e.attrs.direction ?? 'io'] ?? 'passive'} ${shape} (at ${fmt(num(e.attrs.x))} ${fmt(num(e.attrs.y))} ${r.angle})` +
							` (length ${fmt(PIN_LENGTH[e.attrs.length ?? 'long'] ?? 7.62)}) (name ${q(shownName)} ${effects(1.27)}) (number ${q(pad || pinName)} ${effects(1.27)}))`
					);
				} else if (e.tag === 'text') {
					if (e.text.trim().startsWith('>')) continue; // fields, placed per instance
					const r = rotation(e.attrs.rot);
					const p = textPlacement(e.attrs.align, r.angle);
					// Symbol text angles are in tenths of a degree.
					body.push(`(text ${q(e.text)} (at ${fmt(num(e.attrs.x))} ${fmt(num(e.attrs.y))} ${p.angle * 10}) ${effects(num(e.attrs.size, 1.778) * 0.9, { justify: p.justify })})`);
				} else if (e.tag === 'frame') {
					body.push(...frame(e, IDENTITY, (s, x, y) => `(text ${q(s)} (at ${fmt(x)} ${fmt(y)} 0) ${effects(1.8)})`));
				} else {
					const g = drawing(e, IDENTITY, false);
					if (g) body.push(g);
				}
			}
			units.push(`(symbol ${q(`${base}_${unit}_1`)} ${body.join(' ')})`);
		});

		const description = stripHtml(child(deviceset, 'description')?.text ?? '');
		const sexpr =
			`(symbol ${q(id)}${power ? ' (power)' : ''} (pin_names (offset 0.508))${showNumbers && !power ? '' : ' (pin_numbers (hide yes))'}` +
			` (exclude_from_sim no) (in_bom ${physical ? 'yes' : 'no'}) (on_board ${physical ? 'yes' : 'no'})` +
			` (property "Reference" ${q(deviceset.attrs.prefix || 'U')} (at 0 0 0) ${effects(1.27)})` +
			` (property "Value" ${q(base)} (at 0 0 0) ${effects(1.27)})` +
			` (property "Footprint" "" (at 0 0 0) ${effects(1.27, { hide: true })})` +
			` (property "Datasheet" "" (at 0 0 0) ${effects(1.27, { hide: true })})` +
			` (property "Description" ${q(description)} (at 0 0 0) ${effects(1.27, { hide: true })})` +
			` ${units.join(' ')})`;
		const entry = { id, sexpr, power, gates, physical };
		libSymbols.set(key, entry);
		return entry;
	}

	/** Attribute values for >TEXT fields: the part's, its technology's, then the drawing's. */
	function attributeValue(key: string, part: XmlElement | null, sheetNo: number, gate?: string) {
		switch (key) {
			case 'SHEET': return `${sheetNo}/${sheets.length}`;
			case 'SHEETNR': return String(sheetNo);
			case 'SHEETS': case 'SHEET_TOTAL': return String(sheets.length);
			case 'DRAWING_NAME': return drawingName;
			case 'GATE': return gate ?? '';
			case 'PART': return part?.attrs.name ?? '';
			case 'LAST_DATE_TIME': case 'PLOT_DATE_TIME': return '';
		}
		if (part) {
			const own = children(part, 'attribute').find((a) => (a.attrs.name ?? '').toUpperCase() === key);
			if (own) return own.attrs.value ?? '';
			const lib = libraries.get(part.attrs.library ?? '');
			const device = children(child(lib?.devicesets.get(part.attrs.deviceset ?? ''), 'devices'), 'device').find((d) => (d.attrs.name ?? '') === (part.attrs.device ?? ''));
			const technology = children(child(device, 'technologies'), 'technology').find((t) => (t.attrs.name ?? '') === (part.attrs.technology ?? ''));
			const fromTech = children(technology, 'attribute').find((a) => (a.attrs.name ?? '').toUpperCase() === key);
			if (fromTech) return fromTech.attrs.value ?? '';
		}
		return globalAttributes.get(key) ?? '';
	}

	/* ---- nets that appear on several sheets need global labels ---- */
	const netSheets = new Map<string, Set<number>>();
	sheets.forEach((sheet, i) => {
		for (const net of children(child(sheet, 'nets'), 'net')) {
			const set = netSheets.get(net.attrs.name ?? '') ?? new Set<number>();
			set.add(i);
			netSheets.set(net.attrs.name ?? '', set);
		}
	});

	const project = idSafe(name);
	const rootUuid = makeUuid(`root:${name}`);
	const multi = sheets.length > 1;
	const sheetUuids = sheets.map((_, i) => makeUuid(`sheet:${i}`));
	const fileName = (i: number) => (multi ? `${name}-sheet${String(i + 1).padStart(2, '0')}.kicad_sch` : `${name}.kicad_sch`);
	let partCount = 0;

	/* ---- one KiCad file per Eagle sheet ---- */
	const sheetFiles = sheets.map((sheet, index) => {
		const sheetNo = index + 1;
		const instancePath = multi ? `/${rootUuid}/${sheetUuids[index]}` : `/${rootUuid}`;
		const fileUuid = multi ? makeUuid(`file:${index}`) : rootUuid;

		// Page: everything on the sheet, with a margin. KiCad's y axis points down.
		const xs: number[] = [], ys: number[] = [];
		const collect = (e: XmlElement) => {
			for (const [k, v] of Object.entries(e.attrs)) if (/^[xy][12]?$/.test(k)) (k[0] === 'x' ? xs : ys).push(num(v));
			e.children.forEach(collect);
		};
		collect(sheet);
		if (!xs.length) xs.push(0);
		if (!ys.length) ys.push(0);
		const minX = Math.min(...xs) - 10, maxX = Math.max(...xs) + 10;
		const minY = Math.min(...ys) - 10, maxY = Math.max(...ys) + 10;
		const t: Transform = { x: (x) => x - minX, y: (y) => maxY - y };
		const out: string[] = [];
		const used = new Set<LibSymbol>();

		const sheetText = (text: string, e: XmlElement) => {
			const r = rotation(e.attrs.rot);
			const p = textPlacement(e.attrs.align, r.angle);
			const value = text.trim().startsWith('>') ? attributeValue(text.trim().slice(1).toUpperCase(), null, sheetNo) : text;
			return `(text ${q(value)} (exclude_from_sim no) (at ${fmt(t.x(num(e.attrs.x)))} ${fmt(t.y(num(e.attrs.y)))} ${p.angle}) ${effects(num(e.attrs.size, 1.778) * 0.9, { justify: p.justify })} (uuid ${q(makeUuid('text'))}))`;
		};

		for (const e of child(sheet, 'plain')?.children ?? []) {
			if (e.tag === 'text') out.push(sheetText(e.text, e));
			else if (e.tag === 'frame') out.push(...frame(e, t, (s, x, y) => `(text ${q(s)} (exclude_from_sim no) (at ${fmt(t.x(x))} ${fmt(t.y(y))} 0) ${effects(1.8)} (uuid ${q(makeUuid('frame'))}))`));
			else {
				const g = drawing(e, t, true);
				if (g) out.push(g);
			}
		}

		for (const instance of children(child(sheet, 'instances'), 'instance')) {
			const part = parts.get(instance.attrs.part ?? '');
			if (!part) continue;
			const lib = libSymbolFor(part);
			const gate = lib?.gates.get(instance.attrs.gate ?? '');
			if (!lib || !gate) continue;
			used.add(lib);
			partCount++;
			const r = rotation(instance.attrs.rot);
			const x = t.x(num(instance.attrs.x));
			const y = t.y(num(instance.attrs.y));
			const smashed = new Map(children(instance, 'attribute').map((a) => [(a.attrs.name ?? '').toUpperCase(), a]));

			// A field at its smashed position, or at the symbol's text moved with the part.
			const field = (key: string, symbolText: XmlElement | undefined) => {
				const s = smashed.get(key);
				if (s && s.attrs.x !== undefined) {
					const sr = rotation(s.attrs.rot);
					const p = fieldPlacement(s.attrs.align, (sr.angle - r.angle + 360) % 360, sr.angle, sr.mirror !== r.mirror);
					return { at: `(at ${fmt(t.x(num(s.attrs.x)))} ${fmt(t.y(num(s.attrs.y)))} ${p.angle})`, size: num(s.attrs.size, 1.778), justify: p.justify, hide: s.attrs.display === 'off' };
				}
				if (!symbolText) return { at: `(at ${fmt(x)} ${fmt(y)} 0)`, size: 1.778, justify: '', hide: true };
				let lx = num(symbolText.attrs.x);
				const ly = num(symbolText.attrs.y);
				if (r.mirror) lx = -lx;
				const a = (r.angle * Math.PI) / 180;
				const rx = lx * Math.cos(a) - ly * Math.sin(a);
				const ry = lx * Math.sin(a) + ly * Math.cos(a);
				const tr = rotation(symbolText.attrs.rot);
				const p = fieldPlacement(symbolText.attrs.align, tr.angle, (tr.angle + r.angle) % 360, tr.mirror !== r.mirror);
				return { at: `(at ${fmt(x + rx)} ${fmt(y - ry)} ${p.angle})`, size: num(symbolText.attrs.size, 1.778), justify: p.justify, hide: false };
			};
			const texts = children(gate.symbol, 'text').filter((e) => e.text.trim().startsWith('>'));
			const textFor = (key: string) => texts.find((e) => e.text.trim().slice(1).toUpperCase() === key);

			const partName = part.attrs.name ?? '';
			const reference = lib.power ? `#${partName}` : partName;
			const value = part.attrs.value ?? (lib.power ? part.attrs.deviceset ?? '' : defaultValue(part.attrs.deviceset ?? '', part.attrs.device ?? '', part.attrs.technology ?? ''));
			const ref = field('NAME', textFor('NAME'));
			const val = field('VALUE', textFor('VALUE'));
			const pkg = children(child(libraries.get(part.attrs.library ?? '')?.devicesets.get(part.attrs.deviceset ?? ''), 'devices'), 'device').find((d) => (d.attrs.name ?? '') === (part.attrs.device ?? ''))?.attrs.package;
			const mpn = attributeValue('MPN', part, sheetNo) || attributeValue('MANUFACTURER_PART_NUMBER', part, sheetNo);

			const extra: string[] = [];
			const seen = new Set(['NAME', 'VALUE']);
			for (const text of texts) {
				const key = text.text.trim().slice(1).toUpperCase();
				if (seen.has(key) || !/^[A-Z0-9_.+-]{1,40}$/.test(key)) continue;
				seen.add(key);
				const f = field(key, text);
				const fieldName = RESERVED_FIELDS.has(key) ? `Eagle_${key}` : key;
				extra.push(` (property ${q(fieldName)} ${q(attributeValue(key, part, sheetNo, instance.attrs.gate))} ${f.at} ${effects(f.size * 0.9, { hide: f.hide, justify: f.justify })})`);
			}

			// KiCad mirrors after rotating, Eagle before, so the angle runs the other way.
			const angle = r.mirror ? (360 - r.angle) % 360 : r.angle;
			out.push(
				`(symbol (lib_id ${q(lib.id)}) (at ${fmt(x)} ${fmt(y)} ${angle})${r.mirror ? ' (mirror y)' : ''} (unit ${gate.unit})` +
					` (exclude_from_sim no) (in_bom ${lib.physical ? 'yes' : 'no'}) (on_board ${lib.physical ? 'yes' : 'no'}) (dnp no) (uuid ${q(makeUuid(`part:${partName}`))})` +
					` (property "Reference" ${q(reference)} ${ref.at} ${effects(ref.size * 0.9, { hide: lib.power || ref.hide, justify: ref.justify })})` +
					` (property "Value" ${q(value)} ${val.at} ${effects(val.size * 0.9, { hide: val.hide, justify: val.justify })})` +
					` (property "Footprint" ${q(pkg ? `${idSafe(part.attrs.library ?? '')}:${idSafe(pkg)}` : '')} (at ${fmt(x)} ${fmt(y)} 0) ${effects(1.27, { hide: true })})` +
					` (property "MPN" ${q(mpn)} (at ${fmt(x)} ${fmt(y)} 0) ${effects(1.27, { hide: true })})` +
					extra.join('') +
					` (instances (project ${q(project)} (path ${q(instancePath)} (reference ${q(reference)}) (unit ${gate.unit})))))`
			);
		}

		const label = (netName: string, e: XmlElement) => {
			const r = rotation(e.attrs.rot);
			const at = `(at ${fmt(t.x(num(e.attrs.x)))} ${fmt(t.y(num(e.attrs.y)))} ${r.angle})`;
			const size = num(e.attrs.size, 1.778) * 0.9;
			const global = e.attrs.xref === 'yes' || (netSheets.get(netName)?.size ?? 0) > 1;
			return global
				? `(global_label ${q(netName)} (shape passive) ${at} ${effects(size, { justify: r.angle === 180 || r.angle === 270 ? 'right' : 'left' })} (uuid ${q(makeUuid('glabel'))}))`
				: `(label ${q(netName)} ${at} ${effects(size, { justify: 'left bottom' })} (uuid ${q(makeUuid('label'))}))`;
		};
		const segmentLine = (kind: 'wire' | 'bus', e: XmlElement) =>
			`(${kind} (pts (xy ${fmt(t.x(num(e.attrs.x1)))} ${fmt(t.y(num(e.attrs.y1)))}) (xy ${fmt(t.x(num(e.attrs.x2)))} ${fmt(t.y(num(e.attrs.y2)))})) (stroke (width 0) (type default)) (uuid ${q(makeUuid(kind))}))`;

		for (const [tag, kind] of [['nets', 'wire'], ['busses', 'bus']] as const) {
			for (const net of children(child(sheet, tag), tag === 'nets' ? 'net' : 'bus')) {
				const netName = net.attrs.name ?? '';
				for (const segment of children(net, 'segment')) {
					for (const e of segment.children) {
						if (e.tag === 'wire') out.push(segmentLine(kind, e));
						else if (e.tag === 'junction') out.push(`(junction (at ${fmt(t.x(num(e.attrs.x)))} ${fmt(t.y(num(e.attrs.y)))}) (diameter 0) (color 0 0 0 0) (uuid ${q(makeUuid('junction'))}))`);
						else if (e.tag === 'label') out.push(label(netName, e));
					}
				}
			}
		}

		const width = Math.min(2000, maxX - minX), height = Math.min(2000, maxY - minY);
		const content =
			`(kicad_sch (version 20231120) (generator "pcbgit-eagle") (generator_version "1") (uuid ${q(fileUuid)}) (paper "User" ${fmt(width)} ${fmt(height)})\n` +
			`(lib_symbols\n${[...used].map((l) => l.sexpr).join('\n')}\n)\n${out.join('\n')}\n` +
			(multi ? '' : `(sheet_instances (path "/" (page "1")))\n`) +
			')\n';
		return { name: fileName(index), content };
	});

	if (!multi) return { files: sheetFiles, version, sheets: 1, parts: partCount };

	/* ---- several sheets: a root index page with one sheet symbol per Eagle sheet ---- */
	const blocks = sheets.map((sheet, i) => {
		const col = i % 4, row = Math.floor(i / 4);
		const x = 20 + col * 60, y = 30 + row * 45;
		const description = stripHtml(child(sheet, 'description')?.text ?? '').slice(0, 40);
		const sheetName = `Sheet ${String(i + 1).padStart(2, '0')}${description ? ` ${description}` : ''}`;
		return (
			`(sheet (at ${x} ${y}) (size 45 30) (stroke (width 0.1524) (type solid)) (fill (color 0 0 0 0.0000)) (uuid ${q(sheetUuids[i])})` +
			` (property "Sheetname" ${q(sheetName)} (at ${x} ${fmt(y - 0.7)} 0) ${effects(1.27, { justify: 'left bottom' })})` +
			` (property "Sheetfile" ${q(fileName(i))} (at ${x} ${fmt(y + 30.6)} 0) ${effects(1.27, { justify: 'left top' })})` +
			` (instances (project ${q(project)} (path ${q(`/${rootUuid}`)} (page ${q(String(i + 2))})))))`
		);
	});
	const rows = Math.ceil(sheets.length / 4);
	const root =
		`(kicad_sch (version 20231120) (generator "pcbgit-eagle") (generator_version "1") (uuid ${q(rootUuid)}) (paper "User" 260 ${fmt(40 + rows * 45)})\n` +
		`(lib_symbols)\n` +
		`(text ${q(drawingName)} (exclude_from_sim no) (at 20 15 0) ${effects(3, { justify: 'left bottom' })} (uuid ${q(makeUuid('title'))}))\n` +
		`${blocks.join('\n')}\n(sheet_instances (path "/" (page "1")))\n)\n`;
	return { files: [{ name: `${name}.kicad_sch`, content: root }, ...sheetFiles], version, sheets: sheets.length, parts: partCount };
}

/** A minimal project file, so the converted files open as a project in KiCad. */
export function kicadProjectFile(name: string) {
	return `${JSON.stringify({ meta: { filename: `${idSafe(name)}.kicad_pro`, version: 1 }, sheets: [] }, null, 2)}\n`;
}

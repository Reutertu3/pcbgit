/** Readers for kicad-cli's JSON DRC and ERC reports. */

export interface Violation {
	source: 'drc' | 'erc' | 'unconnected' | 'schematic_parity';
	severity: 'error' | 'warning' | 'info' | 'exclusion';
	rule: string;
	message: string;
	detail: string;
	xMm: number | null;
	yMm: number | null;
	layer: string;
}

interface RawItem {
	description?: string;
	pos?: { x?: number; y?: number };
	uuid?: string;
}

interface RawViolation {
	type?: string;
	description?: string;
	severity?: string;
	items?: RawItem[];
}

function normalizeSeverity(value: string | undefined): Violation['severity'] {
	switch ((value ?? '').toLowerCase()) {
		case 'error':
			return 'error';
		case 'warning':
			return 'warning';
		case 'exclusion':
		case 'excluded':
			return 'exclusion';
		default:
			return 'info';
	}
}

function toViolation(raw: RawViolation, source: Violation['source']): Violation {
	const items = raw.items ?? [];
	const first = items[0];
	// Items carry the offending objects; their descriptions are the useful detail.
	const detail = items
		.map((item) => item.description)
		.filter(Boolean)
		.join('\n');
	const layer = /\bon ([A-Za-z0-9_.]+)\b/.exec(first?.description ?? '')?.[1] ?? '';

	return {
		source,
		severity: normalizeSeverity(raw.severity),
		rule: raw.type ?? '',
		message: raw.description ?? raw.type ?? 'Violation',
		detail,
		xMm: typeof first?.pos?.x === 'number' ? first.pos.x : null,
		yMm: typeof first?.pos?.y === 'number' ? first.pos.y : null,
		layer
	};
}

export function parseDrcReport(json: string): Violation[] {
	const report = safeParse(json);
	if (!report) return [];
	return [
		...(report.violations ?? []).map((v: RawViolation) => toViolation(v, 'drc')),
		...(report.unconnected_items ?? []).map((v: RawViolation) => toViolation(v, 'unconnected')),
		...(report.schematic_parity ?? []).map((v: RawViolation) => toViolation(v, 'schematic_parity'))
	];
}

export function parseErcReport(json: string): Violation[] {
	const report = safeParse(json);
	if (!report) return [];
	// ERC groups violations per sheet.
	const sheets = report.sheets ?? [];
	const fromSheets = sheets.flatMap((sheet: { violations?: RawViolation[] }) =>
		(sheet.violations ?? []).map((v) => toViolation(v, 'erc'))
	);
	const topLevel = (report.violations ?? []).map((v: RawViolation) => toViolation(v, 'erc'));
	return [...fromSheets, ...topLevel];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function safeParse(json: string): any {
	try {
		return JSON.parse(json);
	} catch {
		return null;
	}
}

export function countBySeverity(violations: Violation[]) {
	return {
		errors: violations.filter((v) => v.severity === 'error').length,
		warnings: violations.filter((v) => v.severity === 'warning').length
	};
}

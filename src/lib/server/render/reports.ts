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

/**
 * The layer an item description names ("… of R4 on F.Cu"). KiCad writes a layer's
 * user name when it has one ("on Front"), which may contain spaces; those map
 * back to the canonical name so markers know the board side.
 */
function layerOf(description: string, userNames: Record<string, string>) {
	const renamed = Object.entries(userNames)
		.sort(([, a], [, b]) => b.length - a.length)
		.find(([, user]) => new RegExp(`\\bon ${user.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w.])`).test(description));
	if (renamed) return renamed[0];
	return /\bon ([A-Za-z0-9_.]+)\b/.exec(description)?.[1] ?? '';
}

function toViolation(raw: RawViolation, source: Violation['source'], userNames: Record<string, string> = {}): Violation {
	const items = raw.items ?? [];
	const first = items[0];
	// Items carry the offending objects; their descriptions are the useful detail.
	const detail = items
		.map((item) => item.description)
		.filter(Boolean)
		.join('\n');
	const layer = layerOf(first?.description ?? '', userNames);

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

/** `userNames` maps canonical layer names to the board's own names for them. */
export function parseDrcReport(json: string, userNames: Record<string, string> = {}): Violation[] {
	const report = safeParse(json);
	if (!report) return [];
	return [
		...(report.violations ?? []).map((v: RawViolation) => toViolation(v, 'drc', userNames)),
		...(report.unconnected_items ?? []).map((v: RawViolation) => toViolation(v, 'unconnected', userNames)),
		...(report.schematic_parity ?? []).map((v: RawViolation) => toViolation(v, 'schematic_parity', userNames))
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

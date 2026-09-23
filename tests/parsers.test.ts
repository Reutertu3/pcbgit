import assert from 'node:assert/strict';
import test from 'node:test';

import { collapseRefs, groupBom, parseBomCsv, parseCsv, bomToCsv } from '../src/lib/server/render/bom.ts';
import { parseSexpr, children, prop, descendants } from '../src/lib/server/render/sexpr.ts';
import { parseDrcReport, parseErcReport, countBySeverity } from '../src/lib/server/render/reports.ts';
import { renderMarkdown } from '../src/lib/server/markdown.ts';
import { analyzeBoardText } from '../src/lib/server/render/board.ts';
import { renderPcb } from '../scripts/fixtures/kicad.ts';
import { parseViewBox, unionViewBox } from '../src/lib/viewbox.ts';
import { exportableLayers, fabricationLayers, layerIdFromFilename, layerStyle } from '../src/lib/layers.ts';
import { DEFAULT_FAB, FAB_PROFILES, fabProfile } from '../src/lib/fab.ts';
import { orderSchematicSheets, pcbDrillArgs, pcbGerberArgs } from '../src/lib/server/render/kicad.ts';
import { darkSchematicSvg, isSchematicSheet } from '../src/lib/server/render/schematictheme.ts';

test('s-expression parser handles nesting, quotes and escapes', () => {
	const tree = parseSexpr('(kicad_pcb (version 20241229) (title_block (title "Sensor \\"Hub\\"")) (net 1 "GND"))');
	const root = tree[0] as never[];
	assert.equal(root[0], 'kicad_pcb');
	assert.equal(prop(root, 'version'), '20241229');
	const block = children(root, 'title_block')[0];
	assert.equal(prop(block, 'title'), 'Sensor "Hub"');
	assert.equal(children(root, 'net').length, 1);
});

test('s-expression parser survives unbalanced input without throwing', () => {
	assert.doesNotThrow(() => parseSexpr('(a (b (c'));
	assert.doesNotThrow(() => parseSexpr('))) (a)'));
});

test('descendants finds nested nodes at any depth', () => {
	const tree = parseSexpr('(root (a (pts (xy 1 2) (xy 3 4))) (b (pts (xy 5 6))))');
	assert.equal(descendants(tree[0] as never[], 'xy').length, 3);
});

test('collapseRefs compresses runs and keeps singletons', () => {
	assert.equal(collapseRefs(['R1', 'R2', 'R3', 'R7']), 'R1-R3, R7');
	assert.equal(collapseRefs(['C2', 'C1']), 'C1, C2');
	assert.equal(collapseRefs(['U1']), 'U1');
	// Two in a row read better listed than as a range.
	assert.equal(collapseRefs(['R1', 'R2']), 'R1, R2');
	assert.equal(collapseRefs(['R10', 'R9', 'R11']), 'R9-R11');
});

test('groupBom merges identical parts and excludes flagged symbols', () => {
	const symbol = (over: Record<string, unknown>) => ({
		reference: 'R1',
		value: '10k',
		footprint: 'Resistor_SMD:R_0603_1608Metric',
		datasheet: '',
		description: '',
		mpn: '',
		dnp: false,
		excludeFromBom: false,
		sheet: 'root',
		...over
	});

	const lines = groupBom([
		symbol({ reference: 'R1' }),
		symbol({ reference: 'R2' }),
		symbol({ reference: 'R3', value: '1k' }),
		symbol({ reference: '#PWR01', excludeFromBom: true })
	] as never);

	assert.equal(lines.length, 2);
	const tenK = lines.find((line) => line.value === '10k')!;
	assert.equal(tenK.quantity, 2);
	assert.equal(tenK.refs, 'R1, R2');
	// The library prefix is stripped for display.
	assert.equal(tenK.footprint, 'R_0603_1608Metric');
});

test('CSV reader handles quotes, embedded commas and newlines', () => {
	const rows = parseCsv('a,b\n"x,1","line\nbreak"\n"say ""hi""",z');
	assert.deepEqual(rows[0], ['a', 'b']);
	assert.deepEqual(rows[1], ['x,1', 'line\nbreak']);
	assert.deepEqual(rows[2], ['say "hi"', 'z']);
});

test('parseBomCsv maps kicad-cli column names', () => {
	const lines = parseBomCsv('Reference,Value,Footprint,Qty,DNP,Datasheet,Description,MPN\n"R1-R3",10k,R_0603,3,,,"Chip resistor",RC0603FR-0710KL\n');
	assert.equal(lines.length, 1);
	assert.equal(lines[0].quantity, 3);
	assert.equal(lines[0].mpn, 'RC0603FR-0710KL');
	assert.equal(lines[0].dnp, false);
});

test('parseBomCsv infers quantity from the reference list when Qty is absent', () => {
	const lines = parseBomCsv('Reference,Value\n"C1,C2,C3",100n\n');
	assert.equal(lines[0].quantity, 3);
});

test('bomToCsv round-trips through parseBomCsv', () => {
	const original = [
		{ refs: 'R1, R2', value: '10k', footprint: 'R_0603', quantity: 2, datasheet: '', description: 'Resistor, 1%', mpn: 'X1', dnp: false }
	];
	const parsed = parseBomCsv(bomToCsv(original));
	assert.equal(parsed[0].refs, 'R1, R2');
	assert.equal(parsed[0].quantity, 2);
	assert.equal(parsed[0].description, 'Resistor, 1%');
});

test('DRC report reader extracts positions and severities', () => {
	const report = JSON.stringify({
		coordinate_units: 'mm',
		violations: [
			{
				type: 'clearance',
				description: 'Clearance violation (0.15mm < 0.2mm)',
				severity: 'error',
				items: [
					{ description: 'Track [GND] on F.Cu', pos: { x: 12.5, y: 30.25 } },
					{ description: 'Pad 1 of R1' }
				]
			}
		],
		unconnected_items: [
			{ type: 'unconnected_items', description: 'Missing connection', severity: 'warning', items: [{ description: 'Pad 2', pos: { x: 1, y: 2 } }] }
		],
		schematic_parity: []
	});

	const violations = parseDrcReport(report);
	assert.equal(violations.length, 2);
	assert.equal(violations[0].severity, 'error');
	assert.equal(violations[0].xMm, 12.5);
	assert.equal(violations[0].layer, 'F.Cu');
	assert.match(violations[0].detail, /Pad 1 of R1/);
	assert.equal(violations[1].source, 'unconnected');
	assert.deepEqual(countBySeverity(violations), { errors: 1, warnings: 1 });
});

test('ERC report reader reads per-sheet violations', () => {
	const violations = parseErcReport(
		JSON.stringify({ sheets: [{ violations: [{ type: 'pin_not_connected', description: 'Pin not connected', severity: 'warning', items: [] }] }] })
	);
	assert.equal(violations.length, 1);
	assert.equal(violations[0].source, 'erc');
});

test('report readers return empty on malformed input rather than throwing', () => {
	assert.deepEqual(parseDrcReport('not json'), []);
	assert.deepEqual(parseErcReport(''), []);
});

test('markdown escapes HTML before rendering', () => {
	const html = renderMarkdown('# Hi <script>alert(1)</script>\n\n**bold**');
	assert.ok(!html.includes('<script>'));
	assert.ok(html.includes('&lt;script&gt;'));
	assert.ok(html.includes('<strong>bold</strong>'));
});

test('markdown renders blockquotes even though input is escaped first', () => {
	const html = renderMarkdown('> A note worth reading.\n\nPlain text.');
	assert.ok(html.includes('<blockquote>A note worth reading.</blockquote>'));
	assert.ok(html.includes('<p>Plain text.</p>'));
});

test('markdown renders lists, tables and fenced code', () => {
	const html = renderMarkdown('- one\n- two\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n```\nx > y\n```');
	assert.ok(html.includes('<ul>\n<li>one</li>'));
	assert.ok(html.includes('<th>A</th>'));
	assert.ok(html.includes('<td>1</td>'));
	// Code fences keep their content escaped and untouched by inline rules.
	assert.ok(html.includes('x &gt; y'));
});

test('markdown rejects dangerous link schemes', () => {
	const html = renderMarkdown('[click](javascript:alert(1)) and [ok](https://example.com)');
	assert.ok(!html.includes('javascript:'));
	assert.ok(html.includes('href="https://example.com"'));
});

test('viewBox parsing falls back on malformed values', () => {
	assert.deepEqual(parseViewBox('0 0 100 50'), { minX: 0, minY: 0, width: 100, height: 50 });
	assert.deepEqual(parseViewBox('garbage'), { width: 1000, height: 750 });
	assert.deepEqual(parseViewBox(null), { width: 1000, height: 750 });
});

test('unionViewBox spans every layer', () => {
	const union = unionViewBox(['0 0 100 100', '50 50 100 100', null]);
	assert.deepEqual(union, { minX: 0, minY: 0, width: 150, height: 150 });
});

test('layer styles cover inner copper and unknown layers', () => {
	assert.equal(layerStyle('F.Cu').group, 'copper');
	assert.equal(layerStyle('In2.Cu').label, 'Inner copper 2');
	assert.equal(layerStyle('In2.Cu').group, 'copper');
	assert.equal(layerStyle('Totally.Made.Up').label, 'Totally.Made.Up');
});

test('exportableLayers keeps known layers in stacking order', () => {
	const layers = exportableLayers(['B.Cu', 'Edge.Cuts', 'F.Cu', 'In1.Cu', 'Nonsense.Layer', 'F.SilkS']);
	assert.deepEqual(layers, ['F.Cu', 'In1.Cu', 'B.Cu', 'F.SilkS', 'Edge.Cuts']);
});

test('layer filenames map back to layer ids', () => {
	const names = ['F.Cu', 'Edge.Cuts', 'In1.Cu'];
	assert.equal(layerIdFromFilename('board-F_Cu.svg', names), 'F.Cu');
	assert.equal(layerIdFromFilename('F_Cu.svg', names), 'F.Cu');
	assert.equal(layerIdFromFilename('board-Edge_Cuts.svg', names), 'Edge.Cuts');
	assert.equal(layerIdFromFilename('board-Unknown.svg', names), null);
});

test('KiCad plot filenames use user-facing names; they map back to canonical ids', () => {
	const names = ['F.SilkS', 'F.CrtYd', 'Cmts.User'];
	assert.equal(layerIdFromFilename('board-F_Silkscreen.svg', names), 'F.SilkS');
	assert.equal(layerIdFromFilename('board-F_Courtyard.svg', names), 'F.CrtYd');
	assert.equal(layerIdFromFilename('board-User_Comments.svg', names), 'Cmts.User');
	assert.equal(layerStyle('Cmts.User').label, 'Comments');
	assert.ok(exportableLayers(names).includes('Cmts.User'));
});

test('schematic sheets put the root first, even though sub-sheet names sort before it', () => {
	// Filenames as kicad-cli 10 writes them for a root with two sub-sheets.
	const produced = ['Touch-Matrix_Lipo-Tastatur.svg', 'Touch-Matrix_Lipo.svg', 'Touch-Matrix_Lipo-DF-Player.svg', 'notes.txt'];
	assert.deepEqual(orderSchematicSheets(produced, '/tmp/render/Touch-Matrix_Lipo.kicad_sch'), [
		'Touch-Matrix_Lipo.svg',
		'Touch-Matrix_Lipo-DF-Player.svg',
		'Touch-Matrix_Lipo-Tastatur.svg'
	]);
	assert.deepEqual(orderSchematicSheets(['board.svg'], 'board.kicad_sch'), ['board.svg']);
	assert.deepEqual(orderSchematicSheets(['b.svg', 'a.svg'], 'missing.kicad_sch'), ['a.svg', 'b.svg']);
});

test('the dark schematic look swaps KiCad default colours for Gruvbox Dark', () => {
	// As kicad-cli writes them: upper-case background, lower-case strokes.
	const svg = '<g style="fill:#F5F4EF; stroke:#F5F4EF"/><path style="stroke:#009600"/><path style="stroke:#840000;fill:#FFFFC2"/><path style="stroke:#123456"/>';
	assert.equal(
		darkSchematicSvg(svg),
		'<g style="fill:#282828; stroke:#282828"/><path style="stroke:#b8bb26"/><path style="stroke:#fb4934;fill:#3c3836"/><path style="stroke:#123456"/>'
	);
	assert.ok(isSchematicSheet('sheet-0.svg'));
	assert.ok(isSchematicSheet('sub/sheet-12.svg'));
	assert.ok(!isSchematicSheet('layer-F_Cu.svg'));
	assert.ok(!isSchematicSheet('preview-front.svg'));
});

test('layers renamed in the board setup map back from file names and DRC reports', () => {
	// As in a real board: copper renamed to "Front"/"Back", silkscreen with KiCad's default name.
	const board = analyzeBoardText(`(kicad_pcb (version 20241229)
		(layers (0 "F.Cu" signal "Front") (31 "B.Cu" signal "Back") (37 "F.SilkS" user "F.Silkscreen") (44 "Edge.Cuts" user)))`);
	assert.deepEqual(
		board.layers.map((l) => [l.name, l.userName]),
		[['F.Cu', 'Front'], ['B.Cu', 'Back'], ['F.SilkS', 'F.Silkscreen'], ['Edge.Cuts', undefined]]
	);

	const names = board.layers.map((l) => l.name);
	const userNames = Object.fromEntries(board.layers.filter((l) => l.userName).map((l) => [l.name, l.userName!]));
	assert.equal(layerIdFromFilename('BQ25170_Eval-Front.svg', names, userNames), 'F.Cu');
	assert.equal(layerIdFromFilename('BQ25170_Eval-Back.svg', names, userNames), 'B.Cu');
	assert.equal(layerIdFromFilename('BQ25170_Eval-F_Silkscreen.svg', names, userNames), 'F.SilkS');
	assert.equal(layerIdFromFilename('BQ25170_Eval-Edge_Cuts.svg', names, userNames), 'Edge.Cuts');
	// kicad-cli 10 turns "Top Copper: 1/2" into "Top Copper_ 1_2" (checked by plotting).
	assert.equal(layerIdFromFilename('b-Top Copper_ 1_2.svg', ['F.Cu'], { 'F.Cu': 'Top Copper: 1/2' }), 'F.Cu');

	const report = JSON.stringify({
		violations: [
			{ type: 'clearance', severity: 'error', description: 'x', items: [{ description: 'Pad 1 of R4 on Back', pos: { x: 1, y: 2 } }] },
			{ type: 'clearance', severity: 'error', description: 'x', items: [{ description: 'Pad 2 of R5 on Top Copper', pos: { x: 1, y: 2 } }] },
			{ type: 'solder_mask', severity: 'warning', description: 'x', items: [{ description: 'Pad of TS1 on F.Mask', pos: { x: 1, y: 2 } }] }
		]
	});
	assert.deepEqual(
		parseDrcReport(report, { 'B.Cu': 'Back', 'F.Cu': 'Top Copper' }).map((v) => v.layer),
		['B.Cu', 'F.Cu', 'F.Mask']
	);
});

test('fabrication ZIPs carry only manufacturing layers, named per board house', () => {
	const board = ['F.Cu', 'In2.Cu', 'In10.Cu', 'In1.Cu', 'B.Cu', 'F.CrtYd', 'F.Fab', 'Margin', 'F.SilkS', 'B.Mask', 'F.Mask', 'Edge.Cuts', 'User.1'];
	assert.deepEqual(fabricationLayers(board), ['F.Cu', 'In1.Cu', 'In2.Cu', 'In10.Cu', 'B.Cu', 'F.SilkS', 'F.Mask', 'B.Mask', 'Edge.Cuts']);

	const jlc = pcbGerberArgs('/w/b.kicad_pcb', '/w/fab', ['F.Cu', 'B.Cu'], fabProfile('jlcpcb')!);
	assert.ok(jlc.includes('--subtract-soldermask') && jlc.includes('--check-zones'));
	assert.ok(!jlc.includes('--no-protel-ext'), 'JLCPCB gets Protel extensions (.gtl, .gbl)');
	assert.deepEqual(jlc.slice(jlc.indexOf('--layers'), jlc.indexOf('--layers') + 2), ['--layers', 'F.Cu,B.Cu']);

	const generic = pcbGerberArgs('/w/b.kicad_pcb', '/w/fab', ['F.Cu'], fabProfile('generic')!);
	assert.ok(generic.includes('--no-protel-ext') && !generic.includes('--subtract-soldermask') && generic.includes('--check-zones'));
	assert.ok(pcbDrillArgs('/w/b.kicad_pcb', '/w/fab').includes('--excellon-separate-th'));
	assert.equal(FAB_PROFILES[0].id, DEFAULT_FAB);

	// AISLER: its documented file names, drill data in inches.
	const aisler = fabProfile('aisler')!;
	assert.equal(aisler.drillUnits, 'in');
	const drill = pcbDrillArgs('/w/b.kicad_pcb', '/w/fab', aisler.drillUnits);
	assert.equal(drill[drill.indexOf('--excellon-units') + 1], 'in');
	assert.equal(aisler.fileName!('Board', 'F.Cu'), 'Board.toplayer.ger');
	assert.equal(aisler.fileName!('Board', 'B.Cu'), 'Board.bottomlayer.ger');
	assert.equal(aisler.fileName!('Board', 'In2.Cu'), 'Board.internalplane2.ger');
	assert.equal(aisler.fileName!('Board', 'Edge.Cuts'), 'Board.boardoutline.ger');
	assert.equal(aisler.fileName!('Board', 'F.SilkS'), 'Board.topsilkscreen.ger');
	assert.equal(aisler.fileName!('Board', 'PTH'), 'Board.drills_pth.xln');
	assert.equal(aisler.fileName!('Board', 'NPTH'), 'Board.holes_npth.xln');
	assert.equal(aisler.fileName!('Board', 'F.Fab'), null);
});

test('footprints are classified as SMD or through-hole by reference', () => {
	const pcb = renderPcb({
		name: 'mounts', title: 'Mounts', widthMm: 20, heightMm: 20, copperLayers: 2, nets: ['GND'],
		parts: [
			{ ref: 'R1', value: '1k', footprint: 'R:R_0603', description: '', x: 105, y: 85 },
			{ ref: 'J1', value: 'HDR', footprint: 'C:PinHeader', description: '', x: 110, y: 90, smd: false }
		],
		readme: '', description: '', tags: [], license: ''
	});
	assert.deepEqual(analyzeBoardText(pcb).mounts, { R1: 'smd', J1: 'tht' });
});

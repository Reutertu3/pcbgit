/** Eagle import: the XML reader's defences, detection, the schematic converter and the board fix. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';

import { XmlError, parseXml } from '../src/lib/server/render/eagle/xml.ts';
import { classifyEagleHead, discoverEagleFiles } from '../src/lib/server/render/eagle/detect.ts';
import { EagleConvertError, convertEagleSchematic } from '../src/lib/server/render/eagle/schematic.ts';
import { fixImportedEagleBoard } from '../src/lib/server/render/eagle/board.ts';
import { parseSexpr, type SNode } from '../src/lib/server/render/sexpr.ts';
import { eagleSchematic } from './eagle-fixture.ts';

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'pcbgit-eagle-'));
after(() => fs.rmSync(base, { recursive: true, force: true }));

/* -------------------------------------------------------------- XML reader */

test('the XML reader decodes the predefined entities and nothing else', () => {
	const doc = parseXml(`<a x="1 &lt; 2 &amp; &#65;&#x42;&#0;"><b>&gt;NAME</b><c/></a>`);
	const a = doc.children[0];
	assert.equal(a.attrs.x, '1 < 2 & AB');
	assert.equal(a.children[0].text, '>NAME');
	assert.equal(a.children[1].tag, 'c');
	// Unknown entities are left as text, never looked up.
	assert.equal(parseXml('<a>&ent;</a>').children[0].text, '&ent;');
});

test('the XML reader refuses entity declarations, deep nesting, size and broken markup', () => {
	const laughs = `<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;">]><lolz>&lol2;</lolz>`;
	assert.throws(() => parseXml(laughs), XmlError);
	const xxe = `<!DOCTYPE eagle [<!ENTITY x SYSTEM "file:///etc/passwd">]><eagle>&x;</eagle>`;
	assert.throws(() => parseXml(xxe), XmlError);
	assert.throws(() => parseXml('<a>'.repeat(100) + '</a>'.repeat(100)), /nested too deeply/);
	assert.throws(() => parseXml('<a></a>', { bytes: 3, depth: 64, elements: 10 }), /too large/);
	assert.throws(() => parseXml('<a><b></a>'), XmlError);
	assert.throws(() => parseXml('<a x=unquoted></a>'), XmlError);
	// Eagle's own DOCTYPE, without declarations, is fine.
	assert.equal(parseXml('<!DOCTYPE eagle SYSTEM "eagle.dtd"><eagle/>').children[0].tag, 'eagle');
});

/* -------------------------------------------------------------- detection */

test('Eagle 6+ XML, the old binary format and KiCad 5 files are told apart', () => {
	assert.deepEqual(classifyEagleHead(Buffer.from('<?xml version="1.0"?>\n<!DOCTYPE eagle SYSTEM "eagle.dtd">\n<eagle version="6.1">')), { type: 'eagle', version: '6.1' });
	assert.deepEqual(classifyEagleHead(Buffer.from([0x10, 0x80, 0x00, 0x14, 0x00, 0x00])), { type: 'legacy' });
	assert.deepEqual(classifyEagleHead(Buffer.from('EESchema Schematic File Version 4\n')), { type: 'other' });
});

test('discovery pairs schematic and board by name and prefers the newest version', () => {
	const dir = path.join(base, 'discover');
	fs.mkdirSync(path.join(dir, 'old'), { recursive: true });
	// The real Xino RF folder: the newer version has a longer name that sorts first.
	fs.writeFileSync(path.join(dir, 'Xino v1.3.sch'), eagleSchematic({ version: '6.1' }));
	fs.writeFileSync(path.join(dir, 'Xino v1.3.brd'), '<?xml version="1.0"?><eagle version="6.1"></eagle>');
	fs.writeFileSync(path.join(dir, 'B008 - Xino v1.5.sch'), eagleSchematic({ version: '6.1' }));
	fs.writeFileSync(path.join(dir, 'B008 - Xino v1.5.brd'), '<?xml version="1.0"?><eagle version="6.1"></eagle>');
	fs.writeFileSync(path.join(dir, 'old', 'ancient.sch'), Buffer.from([0x10, 0x80, 0, 0, 0, 0]));
	fs.symlinkSync('/etc/passwd', path.join(dir, 'link.sch'));

	const found = discoverEagleFiles(dir);
	assert.equal(path.basename(found.sch!), 'B008 - Xino v1.5.sch');
	assert.equal(path.basename(found.brd!), 'B008 - Xino v1.5.brd');
	assert.equal(found.version, '6.1');
	assert.deepEqual(found.legacy.map((f) => path.basename(f)), ['ancient.sch']);
});

/* -------------------------------------------------------------- conversion */

/** Top-level items of a converted file, parsed with pcbgit's own S-expression reader. */
function items(content: string) {
	const [root] = parseSexpr(content) as SNode[][];
	assert.equal(root[0], 'kicad_sch');
	return root.slice(1).filter(Array.isArray) as SNode[][];
}
const prop = (node: SNode[], name: string) =>
	(node.find((n) => Array.isArray(n) && n[0] === 'property' && n[1] === name) as SNode[] | undefined)?.[2];

test('a sheet converts into symbols, parts, wires, junctions and labels', () => {
	const result = convertEagleSchematic(eagleSchematic(), 'board', 'demo');
	assert.equal(result.version, '9.1.3');
	assert.equal(result.files.length, 1);
	assert.equal(result.files[0].name, 'board.kicad_sch');
	const all = items(result.files[0].content);
	const symbols = all.filter((n) => n[0] === 'symbol');
	const r1 = symbols.find((s) => prop(s, 'Reference') === 'R1')!;
	// Eagle's default value: device set name plus device; package and technology attributes carry over.
	assert.equal(prop(r1, 'Value'), 'R-EU_R0603');
	assert.equal(prop(r1, 'Footprint'), 'demo:R0603');
	assert.equal(prop(r1, 'TOLERANCE'), '1%');
	// Supply symbols are power symbols with a hidden '#' reference.
	assert.equal(prop(symbols.find((s) => prop(s, 'Value') === 'GND')!, 'Reference'), '#GND1');
	// Frame placeholders are filled in.
	const frame = symbols.find((s) => prop(s, 'Reference') === 'FRAME1')!;
	assert.equal(prop(frame, 'SHEET'), '1/1');
	assert.equal(prop(frame, 'PROJECT'), 'Demo board');
	assert.ok(all.some((n) => n[0] === 'wire'));
	assert.ok(all.some((n) => n[0] === 'junction'));
	assert.ok(all.some((n) => n[0] === 'label' && n[1] === 'SIG'));
	// Pad numbers come from the device's connects; the resistor's pins are hidden in Eagle.
	const lib = (all.find((n) => n[0] === 'lib_symbols') as SNode[]).slice(1) as SNode[][];
	const resistor = lib.find((s) => String(s[1]).includes('R-EU'))!;
	assert.ok(JSON.stringify(resistor).includes('"pin_numbers",["hide","yes"]'));
	assert.ok(JSON.stringify(resistor).includes('"arc"'), 'curved wires become arcs');
});

test('values from the file cannot break out of their strings', () => {
	const evil = 'x") (symbol (lib_id "evil")) ("';
	const escaped = evil.replace(/"/g, '&quot;');
	const result = convertEagleSchematic(eagleSchematic({ r1Value: `${escaped}&#10;second line` }), 'board', 'demo');
	const r1 = items(result.files[0].content).find((n) => n[0] === 'symbol' && prop(n, 'Reference') === 'R1')!;
	assert.equal(prop(r1, 'Value'), `${evil}\nsecond line`);
	assert.ok(!items(result.files[0].content).some((n) => n[0] === 'symbol' && JSON.stringify(n).includes('"lib_id","evil"')));
});

test('pages are standard sheets that hold the whole drawing, frames included', () => {
	// The fixture's frame is a 100 x 80 mm symbol at the origin; nothing else reaches that far.
	const result = convertEagleSchematic(eagleSchematic(), 'board', 'demo');
	const [, name, orientation] = items(result.files[0].content).find((n) => n[0] === 'paper')!;
	assert.equal(name, 'A4');
	assert.equal(orientation, undefined, 'landscape');
	// Everything, the frame's far corner included, lies on the 297 x 210 mm sheet.
	// Only what is placed on the sheet: library symbols are drawn around their own origin.
	const placed = JSON.stringify(items(result.files[0].content).filter((n) => n[0] !== 'lib_symbols'));
	const coords = [...placed.matchAll(/\["(?:xy|at)","([-\d.]+)","([-\d.]+)"/g)].map((m) => [Number(m[1]), Number(m[2])]);
	assert.ok(coords.length > 20);
	assert.ok(coords.every(([x, y]) => x >= 0 && x <= 297 && y >= 0 && y <= 210));
});

test('absurd coordinates are clamped instead of producing an absurd page', () => {
	const result = convertEagleSchematic(eagleSchematic({ r1X: '1e300' }), 'board', 'demo');
	const paper = items(result.files[0].content).find((n) => n[0] === 'paper')!;
	assert.equal(paper[1], 'User', 'too big for A0');
	assert.ok(Number(paper[2]) <= 5000 && Number(paper[3]) <= 5000, String(paper));
	const nan = convertEagleSchematic(eagleSchematic({ r1X: 'NaN' }), 'board', 'demo');
	assert.ok(!nan.files[0].content.includes('NaN'));
});

test('several sheets become an index page with one file per sheet and global labels', () => {
	const result = convertEagleSchematic(eagleSchematic({ sheets: 2 }), 'board', 'demo');
	assert.deepEqual(result.files.map((f) => f.name), ['board.kicad_sch', 'board-sheet01.kicad_sch', 'board-sheet02.kicad_sch']);
	const root = items(result.files[0].content);
	const sheets = root.filter((n) => n[0] === 'sheet');
	assert.deepEqual(sheets.map((s) => prop(s, 'Sheetfile')), ['board-sheet01.kicad_sch', 'board-sheet02.kicad_sch']);
	const second = items(result.files[2].content);
	// SIG is on both sheets, so it needs a global label to stay one net.
	assert.ok(second.some((n) => n[0] === 'global_label' && n[1] === 'SIG'));
	assert.equal(prop(second.find((n) => n[0] === 'symbol' && prop(n, 'Reference') === 'FRAME2')!, 'SHEET'), '2/2');
	// Parts on sheet 2 sit under that sheet's path.
	assert.ok(result.files[2].content.includes(`(path "/`) && result.files[2].content.split('(path "/')[1].includes('/'));
});

test('files that are not Eagle 6+ schematics are refused with a reason', () => {
	assert.throws(() => convertEagleSchematic('<eagle version="5.11"><drawing><schematic/></drawing></eagle>', 'board', 'x'), EagleConvertError);
	assert.throws(() => convertEagleSchematic('<eagle version="9.1"><drawing><board/></drawing></eagle>', 'board', 'x'), /not an Eagle schematic/);
	assert.throws(() => convertEagleSchematic('<!DOCTYPE x [<!ENTITY a "b">]><eagle/>', 'board', 'x'), /not a readable Eagle file/);
});

/* -------------------------------------------------------------- board */

test('items kicad-cli put on undefined layers move to a drawing layer', () => {
	const fixed = fixImportedEagleBoard('(gr_text "x" (layer "UNDEFINED")) (dimension (layer "UNDEFINED")) (gr_line (layer "F.Cu"))');
	assert.equal(fixed.moved, 2);
	assert.ok(!fixed.text.includes('UNDEFINED'));
	assert.ok(fixed.text.includes('(layer "F.Cu")'));
});

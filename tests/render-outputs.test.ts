/** Reading renderer output and the checkout from the app, which has /data mounted. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'pcbgit-outputs-'));
after(() => fs.rmSync(base, { recursive: true, force: true }));
// The render directory the renderer shares; everything outside it stands in for /data.
const work = path.join(base, 'work');
fs.mkdirSync(work);
process.env.PCBGIT_RENDER_DIR = work;

const { OutputRefused, readOutput, trustedDir, writeNew } = await import('../src/lib/server/render/outputs.ts');
const { analyzeSchematic } = await import('../src/lib/server/render/schematic.ts');

// What a compromised renderer would like the app to copy out.
const secret = path.join(base, 'pcbgit.db');
fs.writeFileSync(secret, 'SECRET');
const out = path.join(work, 'out-1');
fs.mkdirSync(out);

test('plain files inside the output directory are read', async () => {
	fs.writeFileSync(path.join(out, 'sheet.svg'), '<svg/>');
	fs.mkdirSync(path.join(out, 'layers'));
	fs.writeFileSync(path.join(out, 'layers', 'F_Cu.svg'), '<svg id="f"/>');
	assert.equal((await readOutput(path.join(out, 'sheet.svg'), out)).toString(), '<svg/>');
	assert.equal((await readOutput(path.join(out, 'layers', 'F_Cu.svg'), out)).toString(), '<svg id="f"/>');
});

test('links out of the directory are refused, however they are built', async () => {
	fs.symlinkSync(secret, path.join(out, 'preview.svg'));
	fs.symlinkSync(base, path.join(out, 'linked-dir'));
	fs.mkdirSync(path.join(out, 'x'));
	fs.symlinkSync('..', path.join(out, 'x', 'd'));
	// x/d is out-1 itself, so this reads like x/pcbgit.db but lands on the secret.
	fs.symlinkSync('d/../../pcbgit.db', path.join(out, 'x', 'chain.svg'));
	for (const file of ['preview.svg', 'linked-dir/pcbgit.db', 'x/chain.svg']) {
		await assert.rejects(readOutput(path.join(out, file), out), OutputRefused, file);
	}
});

test('directories and FIFOs are refused without blocking', async () => {
	await assert.rejects(readOutput(path.join(out, 'layers'), out), OutputRefused);
	const fifo = path.join(out, 'board.glb');
	execFileSync('mkfifo', [fifo]);
	await assert.rejects(readOutput(fifo, out), OutputRefused);
});

test('files the app creates there never write through a planted link', async () => {
	const planted = path.join(out, 'avatar.svg');
	fs.symlinkSync(secret, planted);
	await assert.rejects(writeNew(planted, 'overwritten'), { code: 'EEXIST' });
	assert.equal(fs.readFileSync(secret, 'utf8'), 'SECRET');
	await writeNew(path.join(out, 'fresh.svg'), 'ok');
	assert.equal(fs.readFileSync(path.join(out, 'fresh.svg'), 'utf8'), 'ok');
});

test('a job directory swapped for a link is refused, for reading and for writing', async () => {
	// The renderer renames its job directory and puts a link to "/data" in its place.
	const outside = path.join(base, 'data-dir');
	fs.mkdirSync(outside);
	fs.writeFileSync(path.join(outside, 'sheet.svg'), 'SECRET');
	const swapped = path.join(work, 'out-2');
	fs.symlinkSync(outside, swapped);
	await assert.rejects(readOutput(path.join(swapped, 'sheet.svg'), swapped), OutputRefused);
	await assert.rejects(writeNew(path.join(swapped, 'board.kicad_pcb'), 'x'), OutputRefused);
	assert.ok(!fs.existsSync(path.join(outside, 'board.kicad_pcb')));
	// The same one level down, and directories outside the render directory altogether.
	fs.mkdirSync(path.join(work, 'out-3'));
	fs.symlinkSync(outside, path.join(work, 'out-3', 'converted'));
	await assert.rejects(writeNew(path.join(work, 'out-3', 'converted', 'board.kicad_pcb'), 'x'), OutputRefused);
	await assert.rejects(trustedDir(base), OutputRefused);
	await assert.rejects(trustedDir(work), OutputRefused);
});

test('the schematic fallback reads sub-sheets inside the checkout only', async () => {
	const symbol = (ref: string) => `(symbol (property "Reference" "${ref}") (property "Value" "10k"))`;
	const sheet = (file: string) => `(sheet (property "Sheetname" "${file}") (property "Sheetfile" "${file}"))`;
	fs.writeFileSync(path.join(work, 'outside.kicad_sch'), `(kicad_sch ${symbol('LEAK1')})`);
	const checkout = path.join(work, 'checkout-1');
	fs.mkdirSync(checkout);
	fs.writeFileSync(path.join(checkout, 'sub.kicad_sch'), `(kicad_sch ${symbol('R2')})`);
	fs.symlinkSync(path.join(work, 'outside.kicad_sch'), path.join(checkout, 'linked.kicad_sch'));
	fs.writeFileSync(
		path.join(checkout, 'root.kicad_sch'),
		`(kicad_sch ${symbol('R1')} ${sheet('sub.kicad_sch')} ${sheet('../outside.kicad_sch')} ${sheet('linked.kicad_sch')} ${sheet(secret)})`
	);

	const stats = analyzeSchematic(path.join(checkout, 'root.kicad_sch'), await trustedDir(checkout));
	assert.deepEqual(stats.symbols.map((s) => s.reference), ['R1', 'R2']);
	assert.equal(stats.sheets.length, 2);
});

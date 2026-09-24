/**
 * Converts an Eagle schematic into KiCad schematic files. Run by the render worker
 * through runTool, so in Docker it runs in the renderer container, next to
 * kicad-cli, on files in the render directory:
 *
 *   node scripts/eagle-convert.ts <input.sch> <output dir>
 *
 * Writes <output dir>/board.kicad_sch (plus one file per sheet when there are
 * several) and board.kicad_pro, and prints a JSON summary. File names are fixed;
 * nothing from the input ends up in a path.
 */
import fs from 'node:fs';
import path from 'node:path';
import { CONVERTED_STEM, EagleConvertError, convertEagleSchematic, kicadProjectFile } from '../src/lib/server/render/eagle/schematic.ts';
import { XML_LIMITS } from '../src/lib/server/render/eagle/xml.ts';

const [input, outDir] = process.argv.slice(2);
if (!input || !outDir) {
	console.error('usage: eagle-convert.ts <input.sch> <output dir>');
	process.exit(64);
}

try {
	const stat = fs.lstatSync(input);
	if (!stat.isFile()) throw new EagleConvertError('input is not a plain file');
	if (stat.size > XML_LIMITS.bytes) throw new EagleConvertError('file too large');
	if (!fs.lstatSync(outDir).isDirectory()) throw new EagleConvertError('output is not a directory');

	const drawingName = path.basename(input).replace(/\.sch$/i, '');
	const result = convertEagleSchematic(fs.readFileSync(input, 'utf8'), CONVERTED_STEM, drawingName);
	// Exclusive create: never write through anything already in the output directory.
	for (const file of result.files) fs.writeFileSync(path.join(outDir, file.name), file.content, { flag: 'wx' });
	fs.writeFileSync(path.join(outDir, `${CONVERTED_STEM}.kicad_pro`), kicadProjectFile(CONVERTED_STEM), { flag: 'wx' });
	console.log(JSON.stringify({ files: result.files.map((f) => f.name), version: result.version, sheets: result.sheets, parts: result.parts }));
} catch (error) {
	console.error(error instanceof EagleConvertError ? error.message : `conversion failed: ${(error as Error).message}`);
	process.exit(2);
}

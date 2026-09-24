import AdmZip from 'adm-zip';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { storeArtifact } from './artifacts';
import { fixImportedEagleBoard } from './eagle/board';
import type { EagleProjectFiles } from './eagle/detect';
import { CONVERTED_STEM } from './eagle/schematic';
import { pcbImportEagleArgs, runEagleConvert, runKicad } from './kicad';
import type { KicadProjectFiles } from './kicadfiles';
import { readOutput, writeNew } from './outputs';

/**
 * Turns an Eagle project into KiCad files in `<outDir>/converted`, which the rest of
 * the render then treats like a native project. Both steps run in the renderer:
 * the schematic through scripts/eagle-convert.ts, the board through kicad-cli's
 * importer. The converted project is also stored as a download.
 */
export async function convertEagleProject(eagle: EagleProjectFiles, outDir: string, commitId: string, log: string[]): Promise<KicadProjectFiles> {
	const dir = path.join(outDir, 'converted');
	await fsp.mkdir(dir);
	const sch = path.join(dir, `${CONVERTED_STEM}.kicad_sch`);
	const pcb = path.join(dir, `${CONVERTED_STEM}.kicad_pcb`);

	if (eagle.sch) {
		const result = await runEagleConvert(eagle.sch, dir);
		log.push(`eagle schematic: ${result.ok ? `converted ${result.stdout.trim()}` : `failed (${result.code}) ${result.stderr.trim()}`}`);
	}
	if (eagle.brd) {
		const imported = path.join(dir, 'import.kicad_pcb');
		const result = await runKicad(pcbImportEagleArgs(eagle.brd, imported));
		if (result.ok && fs.existsSync(imported)) {
			const fixed = fixImportedEagleBoard((await readOutput(imported, dir)).toString('utf8'));
			await writeNew(pcb, fixed.text);
			await fsp.rm(imported, { force: true });
			log.push(`eagle board: imported${fixed.moved ? `, ${fixed.moved} item(s) from Eagle-only layers moved to Dwgs.User` : ''}`);
		} else {
			log.push(`eagle board: failed (${result.code}) ${result.stderr.trim()}`);
		}
	}

	const files = (await fsp.readdir(dir)).filter((f) => /\.kicad_(sch|pcb|pro)$/.test(f)).sort();
	if (files.length) {
		const zip = new AdmZip();
		for (const file of files) zip.addFile(`${CONVERTED_STEM}/${file}`, await readOutput(path.join(dir, file), dir));
		await storeArtifact({ commitId, kind: 'converted_zip', name: 'kicad-project', data: zip.toBuffer(), targetName: 'converted-kicad-project.zip' });
	}

	return {
		root: dir,
		pro: files.includes(`${CONVERTED_STEM}.kicad_pro`) ? path.join(dir, `${CONVERTED_STEM}.kicad_pro`) : undefined,
		sch: files.filter((f) => f.endsWith('.kicad_sch')).map((f) => path.join(dir, f)),
		rootSch: fs.existsSync(sch) ? sch : undefined,
		pcb: fs.existsSync(pcb) ? pcb : undefined
	};
}

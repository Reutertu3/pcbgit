import AdmZip from 'adm-zip';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { exportableLayers, layerIdFromFilename, layerStyle, previewLayers } from '$lib/layers';
import { all, get, newId, now, run, tx } from '../db';
import { exportTree } from '../git';
import { DATA_DIR, TMP_DIR, repoPath } from '../paths';
import { rerenderFlag } from '../restore';
import { clearArtifacts, listArtifacts, storeArtifact, svgGeometry } from './artifacts';
import { analyzeBoard, type BoardStats } from './board';
import { bomToCsv, groupBom, parseBomCsv, type BomLine } from './bom';
import {
	IBOM_SCRIPT,
	kicadVersion,
	pcbCompositeSvgArgs,
	pcbDrcArgs,
	pcbDrillArgs,
	pcbGerberArgs,
	pcbGlbArgs,
	pcbLayerSvgArgs,
	runIbom,
	runKicad,
	schBomArgs,
	schErcArgs,
	schSvgArgs
} from './kicad';
import { discoverKicadFiles, hasKicadContent } from './kicadfiles';
import { ensureThumbnail } from '../thumbnails';
import { countBySeverity, parseDrcReport, parseErcReport, type Violation } from './reports';

interface JobRow {
	id: string;
	project_id: string;
	commit_id: string;
	status: string;
	attempts: number;
}

interface CommitRow {
	id: string;
	project_id: string;
	sha: string;
}

interface ProjectRow {
	id: string;
	slug: string;
	owner_username: string;
}

function hasArtifact(commitId: string, kind: Parameters<typeof listArtifacts>[1]) {
	return listArtifacts(commitId, kind).length > 0;
}

/* ------------------------------------------------------------ job queue */

export function enqueueRender(projectId: string, commitId: string) {
	// One pending job per commit is enough; re-queueing a running job would race.
	const existing = get<{ id: string }>(
		"SELECT id FROM render_jobs WHERE commit_id = ? AND status IN ('queued','running')",
		commitId
	);
	if (existing) return existing.id;

	const id = newId();
	run(
		'INSERT INTO render_jobs (id, project_id, commit_id, status, queued_at) VALUES (?,?,?,?,?)',
		id,
		projectId,
		commitId,
		'queued',
		now()
	);
	run("UPDATE commits SET render_status = 'queued' WHERE id = ?", commitId);
	kick();
	return id;
}

let running = false;

/** Nudges the worker loop. Safe to call from anywhere; it self-serialises. */
export function kick() {
	if (running) return;
	running = true;
	queueMicrotask(async () => {
		try {
			while (await runNextJob()) {
				/* drain the queue */
			}
		} catch (error) {
			console.error('[render] worker loop crashed', error);
		} finally {
			running = false;
		}
	});
}

/** After restoring a snapshot without rendered output, queue every version once. */
export function rerenderAfterRestore() {
	const flag = rerenderFlag(DATA_DIR);
	if (!fs.existsSync(flag)) return;
	const commits = all<{ id: string; project_id: string }>('SELECT id, project_id FROM commits ORDER BY committed_at DESC');
	for (const commit of commits) enqueueRender(commit.project_id, commit.id);
	fs.rmSync(flag, { force: true });
	console.log(`[render] queued ${commits.length} version(s) after restore`);
}

/** Marks jobs abandoned by a crash as failed so they never wedge the queue. */
export function recoverStuckJobs() {
	const stuck = run(
		`UPDATE render_jobs SET status = 'failed', error = 'Interrupted by server restart', finished_at = ?
		 WHERE status = 'running'`,
		now()
	);
	run(
		`UPDATE commits SET render_status = 'failed'
		 WHERE render_status = 'running'`
	);
	if (stuck.changes) console.warn(`[render] reset ${stuck.changes} interrupted job(s)`);
	kick();
}

async function runNextJob(): Promise<boolean> {
	const job = get<JobRow>(
		"SELECT * FROM render_jobs WHERE status = 'queued' ORDER BY queued_at LIMIT 1"
	);
	if (!job) return false;

	run(
		"UPDATE render_jobs SET status = 'running', started_at = ?, attempts = attempts + 1 WHERE id = ?",
		now(),
		job.id
	);
	run("UPDATE commits SET render_status = 'running' WHERE id = ?", job.commit_id);

	const log: string[] = [];
	try {
		await renderCommit(job, log);
		run(
			"UPDATE render_jobs SET status = 'success', finished_at = ?, log = ?, error = '' WHERE id = ?",
			now(),
			log.join('\n').slice(-60_000),
			job.id
		);
		run("UPDATE commits SET render_status = 'success' WHERE id = ?", job.commit_id);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		log.push(`FATAL: ${message}`);
		run(
			"UPDATE render_jobs SET status = 'failed', finished_at = ?, log = ?, error = ? WHERE id = ?",
			now(),
			log.join('\n').slice(-60_000),
			message.slice(0, 2000),
			job.id
		);
		run("UPDATE commits SET render_status = 'failed' WHERE id = ?", job.commit_id);
		console.error(`[render] job ${job.id} failed:`, message);
	}
	return true;
}

/* -------------------------------------------------------------- the job */

async function renderCommit(job: JobRow, log: string[]) {
	const commit = get<CommitRow>('SELECT * FROM commits WHERE id = ?', job.commit_id);
	if (!commit) throw new Error('Commit record disappeared');

	const project = get<ProjectRow>(
		`SELECT p.id, p.slug, u.username AS owner_username
		 FROM projects p JOIN users u ON u.id = p.owner_id WHERE p.id = ?`,
		job.project_id
	);
	if (!project) throw new Error('Project record disappeared');

	const version = await kicadVersion();
	log.push(version ? `kicad-cli: ${version}` : 'kicad-cli: NOT FOUND — metadata-only render');

	const checkout = await exportTree(repoPath(project.owner_username, project.slug), commit.sha, 'render');
	const outDir = await fsp.mkdtemp(path.join(TMP_DIR, 'out-'));

	try {
		const files = discoverKicadFiles(checkout);
		if (!hasKicadContent(files)) {
			throw new Error(
				'No KiCad project found in this commit. Expected a .kicad_pcb or .kicad_sch file.'
			);
		}
		log.push(`Found: ${files.pcb ? path.relative(checkout, files.pcb) : 'no board'} / ${files.rootSch ? path.relative(checkout, files.rootSch) : 'no schematic'}`);

		await clearArtifacts(commit.id);

		const board = files.pcb ? analyzeBoard(files.pcb) : null;
		const bom = await buildBom(files, outDir, commit.id, log, Boolean(version));
		const violations: Violation[] = [];

		if (version) {
			if (files.rootSch) await renderSchematic(files.rootSch, outDir, commit.id, log, violations);
			if (files.pcb) await renderBoard(files.pcb, board, outDir, commit.id, log, violations);
		}

		persistResults(commit.id, board, bom, violations, files.rootSch ? path.basename(files.rootSch, '.kicad_sch') : project.slug);

		// Warm the card thumbnails so the first visitor does not wait for them.
		for (const name of ['sheet-0', 'preview-front']) {
			const thumbnail = await ensureThumbnail(commit.id, name);
			if (thumbnail) log.push(`thumbnail ${name}: ${path.extname(thumbnail.file).slice(1)}`);
		}

		// Partial output is kept above, but a file KiCad could not open must not
		// read as a successful render.
		if (version) {
			const missing = [
				files.pcb && !hasArtifact(commit.id, 'pcb_layer_svg') && 'board',
				files.rootSch && !hasArtifact(commit.id, 'schematic_svg') && 'schematic'
			].filter(Boolean);
			if (missing.length) {
				const reason = log.find((line) => /Failed to load/.test(line)) ?? 'see log';
				throw new Error(`KiCad could not render the ${missing.join(' or ')}: ${reason.replace(/^[^:]+: failed \(\d+\) /, '')}`);
			}
		}
	} finally {
		await fsp.rm(checkout, { recursive: true, force: true });
		await fsp.rm(outDir, { recursive: true, force: true });
	}
}

async function buildBom(
	files: ReturnType<typeof discoverKicadFiles>,
	outDir: string,
	commitId: string,
	log: string[],
	haveKicad: boolean
): Promise<BomLine[]> {
	if (!files.rootSch) return [];

	// Prefer kicad-cli: it resolves hierarchical sheets and multi-unit symbols correctly.
	if (haveKicad) {
		const csvPath = path.join(outDir, 'bom.csv');
		const result = await runKicad(schBomArgs(files.rootSch, csvPath));
		log.push(`bom: ${result.ok ? 'ok' : `failed (${result.code}) ${result.stderr.trim()}`}`);
		if (result.ok && fs.existsSync(csvPath)) {
			const lines = parseBomCsv(await fsp.readFile(csvPath, 'utf8'));
			if (lines.length) {
				await storeArtifact({ commitId, kind: 'bom_csv', name: 'bom.csv', source: csvPath });
				return lines;
			}
		}
	}

	// Fallback: parse the schematic ourselves so the BOM tab is never empty.
	const { analyzeSchematic } = await import('./schematic');
	const lines = groupBom(analyzeSchematic(files.rootSch).symbols);
	log.push(`bom: built from schematic parser (${lines.length} lines)`);
	if (lines.length) {
		const csvPath = path.join(outDir, 'bom.csv');
		await fsp.writeFile(csvPath, bomToCsv(lines));
		await storeArtifact({ commitId, kind: 'bom_csv', name: 'bom.csv', source: csvPath });
	}
	return lines;
}

async function renderSchematic(
	schPath: string,
	outDir: string,
	commitId: string,
	log: string[],
	violations: Violation[]
) {
	const svgDir = path.join(outDir, 'sch-svg');
	await fsp.mkdir(svgDir, { recursive: true });

	const svg = await runKicad(schSvgArgs(schPath, svgDir));
	log.push(`schematic svg: ${svg.ok ? 'ok' : `failed (${svg.code}) ${svg.stderr.trim()}`}`);

	if (svg.ok) {
		const sheets = (await fsp.readdir(svgDir)).filter((f) => f.endsWith('.svg')).sort();
		for (const [index, file] of sheets.entries()) {
			const source = path.join(svgDir, file);
			await storeArtifact({
				commitId,
				kind: 'schematic_svg',
				name: path.basename(file, '.svg'),
				source,
				targetName: `sheet-${index}.svg`,
				ordinal: index,
				meta: { geometry: svgGeometry(source) }
			});
		}
		log.push(`schematic sheets: ${sheets.length}`);
	}

	const ercPath = path.join(outDir, 'erc.json');
	const erc = await runKicad(schErcArgs(schPath, ercPath));
	log.push(`erc: ${erc.ok ? 'ok' : `failed (${erc.code}) ${erc.stderr.trim()}`}`);
	if (fs.existsSync(ercPath)) {
		violations.push(...parseErcReport(await fsp.readFile(ercPath, 'utf8')));
		await storeArtifact({ commitId, kind: 'erc_json', name: 'erc.json', source: ercPath });
	}
}

async function renderBoard(
	pcbPath: string,
	board: BoardStats | null,
	outDir: string,
	commitId: string,
	log: string[],
	violations: Violation[]
) {
	const layerNames = board?.layers.map((l) => l.name) ?? [];
	const layers = exportableLayers(layerNames);

	// Per-layer SVGs, stacked and toggled in the 2D viewer.
	if (layers.length) {
		const layerDir = path.join(outDir, 'pcb-layers');
		await fsp.mkdir(layerDir, { recursive: true });
		const result = await runKicad(pcbLayerSvgArgs(pcbPath, layerDir, layers));
		log.push(`pcb layers: ${result.ok ? 'ok' : `failed (${result.code}) ${result.stderr.trim()}`}`);

		if (result.ok) {
			const produced = (await fsp.readdir(layerDir)).filter((f) => f.endsWith('.svg'));
			let stored = 0;
			for (const file of produced) {
				const layerId = layerIdFromFilename(file, layerNames);
				if (!layerId) continue;
				const style = layerStyle(layerId);
				const source = path.join(layerDir, file);
				await storeArtifact({
					commitId,
					kind: 'pcb_layer_svg',
					name: layerId,
					source,
					targetName: `layer-${layerId.replace(/\./g, '_')}.svg`,
					ordinal: Math.round(style.order * 100),
					meta: { geometry: svgGeometry(source), style }
				});
				stored++;
			}
			log.push(`pcb layers stored: ${stored}/${produced.length}`);
		}
	}

	// Composite previews, used for cards and the overview page.
	for (const side of ['front', 'back'] as const) {
		const preview = previewLayers(layerNames, side);
		if (!preview.length) continue;
		const file = path.join(outDir, `preview-${side}.svg`);
		const result = await runKicad(pcbCompositeSvgArgs(pcbPath, file, preview, side === 'back'));
		if (result.ok && fs.existsSync(file)) {
			await storeArtifact({
				commitId,
				kind: 'pcb_preview_svg',
				name: side,
				source: file,
				ordinal: side === 'front' ? 0 : 1,
				meta: { geometry: svgGeometry(file) }
			});
		}
		log.push(`preview ${side}: ${result.ok ? 'ok' : `failed (${result.code})`}`);
	}

	// Interactive BOM: grouped parts with placement highlighting, one self-contained page.
	if (IBOM_SCRIPT) {
		const result = await runIbom(pcbPath, outDir);
		const file = path.join(outDir, 'ibom.html');
		const stored = result.ok && fs.existsSync(file);
		// iBOM's stderr is mostly wx debug chatter; its last line holds the error.
		log.push(`ibom: ${stored ? 'ok' : `failed (${result.code}) ${result.stderr.trim().split('\n').at(-1)}`}`);
		if (stored) await storeArtifact({ commitId, kind: 'ibom_html', name: 'ibom.html', source: file });
	}

	// 3D model.
	const glb = path.join(outDir, 'board.glb');
	const glbResult = await runKicad(pcbGlbArgs(pcbPath, glb), 600_000);
	log.push(`glb: ${glbResult.ok ? 'ok' : `failed (${glbResult.code}) ${glbResult.stderr.trim()}`}`);
	if (glbResult.ok && fs.existsSync(glb)) {
		await storeArtifact({ commitId, kind: 'pcb_glb', name: 'board.glb', source: glb, meta: { mounts: board?.mounts ?? {} } });
	}

	// DRC.
	const drcPath = path.join(outDir, 'drc.json');
	const drc = await runKicad(pcbDrcArgs(pcbPath, drcPath));
	log.push(`drc: ${drc.ok ? 'ok' : `failed (${drc.code}) ${drc.stderr.trim()}`}`);
	if (fs.existsSync(drcPath)) {
		violations.push(...parseDrcReport(await fsp.readFile(drcPath, 'utf8')));
		await storeArtifact({ commitId, kind: 'drc_json', name: 'drc.json', source: drcPath });
	}

	// Fabrication bundle: gerbers + drill, zipped for download.
	await buildFabZip(pcbPath, outDir, commitId, log);
}

async function buildFabZip(pcbPath: string, outDir: string, commitId: string, log: string[]) {
	const fabDir = path.join(outDir, 'fab');
	await fsp.mkdir(fabDir, { recursive: true });

	const gerbers = await runKicad(pcbGerberArgs(pcbPath, fabDir));
	const drill = await runKicad(pcbDrillArgs(pcbPath, fabDir));
	log.push(`gerbers: ${gerbers.ok ? 'ok' : `failed (${gerbers.code})`}, drill: ${drill.ok ? 'ok' : `failed (${drill.code})`}`);

	const entries = (await fsp.readdir(fabDir)).filter((f) => !f.startsWith('.'));
	if (!entries.length) return;

	const zip = new AdmZip();
	for (const entry of entries) {
		const full = path.join(fabDir, entry);
		if ((await fsp.stat(full)).isFile()) zip.addLocalFile(full);
	}
	const zipPath = path.join(outDir, 'fabrication.zip');
	zip.writeZip(zipPath);
	await storeArtifact({ commitId, kind: 'fab_zip', name: 'fabrication.zip', source: zipPath });
}

function persistResults(
	commitId: string,
	board: BoardStats | null,
	bom: BomLine[],
	violations: Violation[],
	fallbackName: string
) {
	const drc = countBySeverity(violations.filter((v) => v.source !== 'erc'));
	const erc = countBySeverity(violations.filter((v) => v.source === 'erc'));
	const partCount = bom.filter((line) => !line.dnp).reduce((sum, line) => sum + line.quantity, 0);

	tx(() => {
		run('DELETE FROM bom_items WHERE commit_id = ?', commitId);
		run('DELETE FROM drc_violations WHERE commit_id = ?', commitId);

		bom.forEach((line, index) => {
			run(
				`INSERT INTO bom_items (id, commit_id, refs, value, footprint, quantity, datasheet, description, mpn, dnp, ordinal)
				 VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
				newId(),
				commitId,
				line.refs,
				line.value,
				line.footprint,
				line.quantity,
				line.datasheet,
				line.description,
				line.mpn,
				line.dnp ? 1 : 0,
				index
			);
		});

		violations.forEach((violation, index) => {
			run(
				`INSERT INTO drc_violations (id, commit_id, source, severity, rule, message, detail, x_mm, y_mm, layer, ordinal)
				 VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
				newId(),
				commitId,
				violation.source,
				violation.severity,
				violation.rule,
				violation.message,
				violation.detail,
				violation.xMm,
				violation.yMm,
				violation.layer,
				index
			);
		});

		run(
			`UPDATE commits SET board_name = ?, board_width = ?, board_height = ?, layer_count = ?,
			   net_count = ?, part_count = ?, drc_errors = ?, drc_warnings = ?, erc_errors = ?, erc_warnings = ?,
			   board_bbox = ?
			 WHERE id = ?`,
			board?.title || fallbackName,
			board?.widthMm ?? null,
			board?.heightMm ?? null,
			board?.copperLayers ?? null,
			board?.netCount ?? null,
			partCount || (board?.footprintCount ?? null),
			drc.errors,
			drc.warnings,
			erc.errors,
			erc.warnings,
			board?.bbox ? JSON.stringify(board.bbox) : '',
			commitId
		);
	});
}

export function queueStats() {
	return {
		queued: all<{ n: number }>("SELECT COUNT(*) AS n FROM render_jobs WHERE status = 'queued'")[0]?.n ?? 0,
		running: all<{ n: number }>("SELECT COUNT(*) AS n FROM render_jobs WHERE status = 'running'")[0]?.n ?? 0
	};
}

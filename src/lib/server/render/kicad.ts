import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

export const KICAD_CLI = process.env.PCBGIT_KICAD_CLI ?? 'kicad-cli';

export interface RunResult {
	ok: boolean;
	code: number;
	stdout: string;
	stderr: string;
	command: string;
}

/**
 * kicad-cli is a GUI binary in CLI clothing: it needs a writable HOME for its
 * config and an offscreen Qt platform, or it aborts looking for a display.
 */
function kicadEnv() {
	return {
		...process.env,
		HOME: process.env.PCBGIT_KICAD_HOME ?? process.env.HOME ?? '/tmp',
		QT_QPA_PLATFORM: 'offscreen',
		XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR ?? '/tmp'
	};
}

/**
 * Runs kicad-cli. Never throws: a failed sub-export should degrade the render,
 * not abort the whole job, so every caller decides what a failure means.
 * Exit code 5 means "violations found", which is a successful DRC/ERC run.
 */
export async function runKicad(args: string[], timeoutMs = 240_000): Promise<RunResult> {
	return runTool(KICAD_CLI, args, timeoutMs);
}

/** Interactive HTML BOM script; unset (e.g. in development) skips the iBOM step. */
export const IBOM_SCRIPT = process.env.PCBGIT_IBOM ?? '';

/** Writes `<outDir>/ibom.html` with iBOM, which loads the board through KiCad's Python module. */
export async function runIbom(pcbPath: string, outDir: string): Promise<RunResult> {
	return runTool(
		'python3',
		[IBOM_SCRIPT, '--no-browser', '--dest-dir', outDir, '--name-format', 'ibom', pcbPath],
		120_000,
		{ INTERACTIVE_HTML_BOM_NO_DISPLAY: '1' }
	);
}

async function runTool(bin: string, args: string[], timeoutMs: number, env: Record<string, string> = {}): Promise<RunResult> {
	const command = `${bin} ${args.join(' ')}`;
	try {
		const { stdout, stderr } = await exec(bin, args, {
			env: { ...kicadEnv(), ...env },
			timeout: timeoutMs,
			maxBuffer: 64 * 1024 * 1024
		});
		return { ok: true, code: 0, stdout, stderr, command };
	} catch (error) {
		const err = error as { code?: number | string; stdout?: string; stderr?: string; message: string };
		const code = typeof err.code === 'number' ? err.code : -1;
		return {
			ok: code === 5,
			code,
			stdout: err.stdout ?? '',
			stderr: err.stderr ?? err.message,
			command
		};
	}
}

let versionCache: string | null | undefined;

/** Returns the kicad-cli version string, or null when the binary is missing. */
export async function kicadVersion(): Promise<string | null> {
	if (versionCache !== undefined) return versionCache;
	const result = await runKicad(['--version'], 15_000);
	versionCache = result.ok ? result.stdout.trim().split('\n')[0] : null;
	return versionCache;
}

export function resetKicadVersionCache() {
	versionCache = undefined;
}

/* -------------------------------------------------------------- exports */

export function schSvgArgs(schPath: string, outDir: string) {
	return ['sch', 'export', 'svg', '--output', outDir, schPath];
}

/**
 * Orders the SVGs from schSvgArgs root sheet first. kicad-cli names sub-sheets
 * `<root>-<sheet>.svg`, and '-' sorts before '.', so a plain sort puts them
 * ahead of `<root>.svg` and sheet-0 would be a sub-sheet.
 */
export function orderSchematicSheets(files: string[], schPath: string) {
	const root = `${schPath.split(/[\\/]/).pop()!.replace(/\.kicad_sch$/, '')}.svg`;
	const sheets = files.filter((f) => f.endsWith('.svg')).sort();
	return sheets.includes(root) ? [root, ...sheets.filter((f) => f !== root)] : sheets;
}

export function schBomArgs(schPath: string, outFile: string) {
	return [
		'sch', 'export', 'bom',
		'--output', outFile,
		'--fields', 'Reference,Value,Footprint,${QUANTITY},${DNP},Datasheet,Description,MPN',
		'--labels', 'Reference,Value,Footprint,Qty,DNP,Datasheet,Description,MPN',
		'--group-by', 'Value,Footprint',
		'--sort-field', 'Reference',
		'--sort-asc',
		'--ref-range-delimiter', '-',
		schPath
	];
}

export function schErcArgs(schPath: string, outFile: string) {
	return ['sch', 'erc', '--output', outFile, '--format', 'json', '--units', 'mm', '--severity-all', schPath];
}

/** One SVG per layer. Edge.Cuts rides along on every file so extents line up. */
export function pcbLayerSvgArgs(pcbPath: string, outDir: string, layers: string[]) {
	return [
		'pcb', 'export', 'svg',
		'--output', outDir,
		'--layers', layers.join(','),
		'--common-layers', 'Edge.Cuts',
		'--mode-multi',
		'--page-size-mode', '2',
		'--exclude-drawing-sheet',
		'--drill-shape-opt', '2',
		pcbPath
	];
}

/** A single composite SVG used as the project thumbnail. */
export function pcbCompositeSvgArgs(pcbPath: string, outFile: string, layers: string[], mirror = false) {
	return [
		'pcb', 'export', 'svg',
		'--output', outFile,
		'--layers', layers.join(','),
		'--mode-single',
		'--page-size-mode', '2',
		'--exclude-drawing-sheet',
		'--drill-shape-opt', '2',
		...(mirror ? ['--mirror'] : []),
		pcbPath
	];
}

export function pcbGlbArgs(pcbPath: string, outFile: string) {
	return [
		'pcb', 'export', 'glb',
		'--output', outFile,
		'--force',
		'--subst-models',
		'--include-tracks',
		'--include-pads',
		'--include-zones',
		'--include-silkscreen',
		'--include-soldermask',
		'--cut-vias-in-body',
		'--min-distance', '0.02',
		pcbPath
	];
}

export function pcbDrcArgs(pcbPath: string, outFile: string) {
	return [
		'pcb', 'drc',
		'--output', outFile,
		'--format', 'json',
		'--units', 'mm',
		'--severity-all',
		'--schematic-parity',
		pcbPath
	];
}

export function pcbGerberArgs(pcbPath: string, outDir: string) {
	return ['pcb', 'export', 'gerbers', '--output', outDir, '--no-protel-ext', pcbPath];
}

export function pcbDrillArgs(pcbPath: string, outDir: string) {
	return ['pcb', 'export', 'drill', '--output', outDir, '--format', 'excellon', '--excellon-units', 'mm', '--generate-map', '--map-format', 'gerberx2', pcbPath];
}

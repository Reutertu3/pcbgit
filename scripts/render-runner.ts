/**
 * The renderer: runs kicad-cli, iBOM and the thumbnail rasterisers for the app, in
 * a container that sees only the render directory. The app connects to
 * PCBGIT_RENDER_SOCKET (see runTool in
 * src/lib/server/render/kicad.ts) and sends one JSON request line per tool run;
 * the answer is one JSON line with the exit code and output.
 *
 *   node scripts/render-runner.ts
 *
 * Environment: PCBGIT_RENDER_SOCKET (where to listen), PCBGIT_RENDER_DIR (the only
 * directory tool paths may point into), PCBGIT_KICAD_CLI and PCBGIT_IBOM as in the app.
 */
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { runLocalTool, type RunnerRequest, type RunnerResponse } from '../src/lib/server/render/kicad.ts';

const SOCKET = process.env.PCBGIT_RENDER_SOCKET;
const RENDER_DIR = path.resolve(process.env.PCBGIT_RENDER_DIR ?? '');
const KICAD_CLI = process.env.PCBGIT_KICAD_CLI ?? 'kicad-cli';
const IBOM_SCRIPT = process.env.PCBGIT_IBOM ?? '';

/** Variables a request may set for its tool; the rest of the environment is ours. */
const ALLOWED_ENV = new Set(['INTERACTIVE_HTML_BOM_NO_DISPLAY']);
const MAX_REQUEST_BYTES = 1024 * 1024;
const MAX_TIMEOUT_MS = 15 * 60 * 1000;

if (!SOCKET || !process.env.PCBGIT_RENDER_DIR) {
	console.error('[renderer] set PCBGIT_RENDER_SOCKET and PCBGIT_RENDER_DIR');
	process.exit(1);
}

function inRenderDir(value: string) {
	const resolved = path.resolve(RENDER_DIR, value);
	return resolved === RENDER_DIR || resolved.startsWith(RENDER_DIR + path.sep);
}

/** The executable to run for a request, or why it is refused. */
function resolveRequest(request: RunnerRequest): { bin: string } | { error: string } {
	if (typeof request?.bin !== 'string' || !Array.isArray(request.args) || !request.args.every((arg) => typeof arg === 'string')) {
		return { error: 'malformed request' };
	}
	let bin: string;
	/** Arguments that may name files; the iBOM script itself is allowed by name. */
	let fileArgs = request.args;
	if (request.bin === KICAD_CLI || request.bin === 'kicad-cli') {
		bin = KICAD_CLI;
	} else if (request.bin === 'rsvg-convert' || request.bin === 'cwebp') {
		// Card thumbnails: they decode images embedded in schematics.
		bin = request.bin;
	} else if (request.bin === 'python3' && IBOM_SCRIPT && request.args[0] === IBOM_SCRIPT) {
		// Python only ever runs iBOM, never a script of the caller's choosing.
		bin = 'python3';
		fileArgs = request.args.slice(1);
	} else {
		return { error: `not allowed: ${request.bin}` };
	}
	// Every value must resolve inside the render directory: paths, but also a bare ".."
	// (tools run with the render directory as their working directory). Layer lists
	// and numbers do. Flags carry no paths here, so one holding a slash
	// ("--output=/data/x", "-o/data/x") is refused rather than parsed.
	const outside = fileArgs.find((arg) => (arg.startsWith('-') ? arg.includes('/') : !inRenderDir(arg)));
	if (outside) return { error: `path outside the render directory: ${outside}` };
	return { bin };
}

async function handle(request: RunnerRequest): Promise<RunnerResponse> {
	const resolved = resolveRequest(request);
	if ('error' in resolved) return { code: -1, stdout: '', stderr: `renderer refused: ${resolved.error}` };

	const env = Object.fromEntries(Object.entries(request.env ?? {}).filter(([key, value]) => ALLOWED_ENV.has(key) && typeof value === 'string'));
	const timeout = Math.min(Math.max(Number(request.timeoutMs) || 0, 1000), MAX_TIMEOUT_MS);
	const started = Date.now();
	const result = await runLocalTool(resolved.bin, request.args, timeout, env, RENDER_DIR);
	console.log(`[renderer] ${request.bin} ${request.args.slice(0, 3).join(' ')} → ${result.code} in ${Date.now() - started} ms`);
	return { code: result.code, stdout: result.stdout, stderr: result.stderr };
}

const server = net.createServer((connection) => {
	let buffered = '';
	connection.setEncoding('utf8');
	connection.on('data', (chunk: string) => {
		buffered += chunk;
		if (buffered.length > MAX_REQUEST_BYTES) {
			connection.destroy();
			return;
		}
		const end = buffered.indexOf('\n');
		if (end === -1) return;
		connection.pause();
		let request: RunnerRequest;
		try {
			request = JSON.parse(buffered.slice(0, end));
		} catch {
			connection.end(`${JSON.stringify({ code: -1, stdout: '', stderr: 'renderer refused: malformed request' })}\n`);
			return;
		}
		handle(request).then(
			(response) => connection.end(`${JSON.stringify(response)}\n`),
			(error: Error) => connection.end(`${JSON.stringify({ code: -1, stdout: '', stderr: `renderer failed: ${error.message}` })}\n`)
		);
	});
	connection.on('error', () => {});
});

// A socket file left by a previous run would make listen fail.
fs.rmSync(SOCKET, { force: true });
// Owner only: the app runs as the same user in its own container.
const umask = process.umask(0o177);
server.listen(SOCKET, () => {
	process.umask(umask);
	console.log(`[renderer] listening on ${SOCKET}, tools confined to ${RENDER_DIR}`);
});

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
	process.on(signal, () => {
		server.close();
		fs.rmSync(SOCKET, { force: true });
		process.exit(0);
	});
}

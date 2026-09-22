import { spawn } from 'node:child_process';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { promisify } from 'node:util';

const exec = promisify(execFile);

let backendPath: string | null = null;

async function findBackend() {
	if (backendPath) return backendPath;
	const { stdout } = await exec('git', ['--exec-path']);
	const candidate = path.join(stdout.trim(), 'git-http-backend');
	if (!fs.existsSync(candidate)) throw new Error(`git-http-backend not found at ${candidate}`);
	backendPath = candidate;
	return candidate;
}

export interface BackendRequest {
	repoDir: string;
	/** Path below the repository, e.g. "info/refs" or "git-receive-pack". */
	pathInfo: string;
	method: string;
	queryString: string;
	headers: Headers;
	body: ReadableStream<Uint8Array> | null;
	remoteUser: string;
}

/**
 * Runs `git http-backend` as a CGI program and adapts its output to a fetch
 * Response. This is what makes `git clone` and `git push` work over HTTP.
 */
export async function runGitBackend(request: BackendRequest): Promise<Response> {
	const backend = await findBackend();

	const env: NodeJS.ProcessEnv = {
		PATH: process.env.PATH,
		GIT_PROJECT_ROOT: path.dirname(request.repoDir),
		GIT_HTTP_EXPORT_ALL: '1',
		// Access control is decided before we get here, so the backend serves freely.
		PATH_INFO: `/${path.basename(request.repoDir)}${request.pathInfo}`,
		REQUEST_METHOD: request.method,
		QUERY_STRING: request.queryString,
		REMOTE_USER: request.remoteUser,
		REMOTE_ADDR: '127.0.0.1',
		CONTENT_TYPE: request.headers.get('content-type') ?? '',
		HTTP_CONTENT_ENCODING: request.headers.get('content-encoding') ?? '',
		// Required for protocol v2, which modern clients negotiate by default.
		GIT_PROTOCOL: request.headers.get('git-protocol') ?? '',
		HTTP_USER_AGENT: request.headers.get('user-agent') ?? 'git',
		GIT_COMMITTER_NAME: request.remoteUser || 'kupfergit',
		GIT_COMMITTER_EMAIL: `${request.remoteUser || 'kupfergit'}@kupfergit.local`
	};

	const contentLength = request.headers.get('content-length');
	if (contentLength) env.CONTENT_LENGTH = contentLength;

	const child = spawn(backend, [], { env, stdio: ['pipe', 'pipe', 'pipe'] });

	if (request.body) {
		Readable.fromWeb(request.body as never).pipe(child.stdin);
	} else {
		child.stdin.end();
	}

	let stderr = '';
	child.stderr.on('data', (chunk) => {
		stderr += String(chunk);
	});

	return await cgiToResponse(child, () => stderr);
}

/** Splits the CGI header block off the front of stdout, then streams the body. */
function cgiToResponse(
	child: ReturnType<typeof spawn>,
	getStderr: () => string
): Promise<Response> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		let settled = false;
		let headerEnd = -1;

		const onData = (chunk: Buffer) => {
			chunks.push(chunk);
			const buffered = Buffer.concat(chunks);
			headerEnd = findHeaderEnd(buffered);
			if (headerEnd === -1) return;

			child.stdout!.off('data', onData);
			child.stdout!.off('end', onEnd);
			child.stdout!.off('error', onError);
			settled = true;

			const { status, headers } = parseCgiHeaders(buffered.subarray(0, headerEnd));
			const leftover = buffered.subarray(skipSeparator(buffered, headerEnd));

			// Replay what we already consumed, then hand over the live stream.
			const stream = new ReadableStream<Uint8Array>({
				start(controller) {
					if (leftover.length) controller.enqueue(new Uint8Array(leftover));
					child.stdout!.on('data', (next: Buffer) => controller.enqueue(new Uint8Array(next)));
					child.stdout!.on('end', () => controller.close());
					child.stdout!.on('error', (error) => controller.error(error));
				},
				cancel() {
					child.kill('SIGTERM');
				}
			});

			resolve(new Response(stream, { status, headers }));
		};

		const onEnd = () => {
			if (settled) return;
			// No header block at all means the backend failed before writing a response.
			const message = getStderr().trim() || 'git-http-backend produced no output';
			resolve(new Response(message, { status: 500, headers: { 'content-type': 'text/plain' } }));
		};

		const onError = (error: Error) => {
			if (!settled) reject(error);
		};

		child.stdout!.on('data', onData);
		child.stdout!.on('end', onEnd);
		child.stdout!.on('error', onError);
		child.on('error', onError);
	});
}

function findHeaderEnd(buffer: Buffer) {
	const crlf = buffer.indexOf('\r\n\r\n');
	const lf = buffer.indexOf('\n\n');
	if (crlf === -1) return lf;
	if (lf === -1) return crlf;
	return Math.min(crlf, lf);
}

function skipSeparator(buffer: Buffer, headerEnd: number) {
	return buffer.subarray(headerEnd, headerEnd + 4).toString() === '\r\n\r\n' ? headerEnd + 4 : headerEnd + 2;
}

function parseCgiHeaders(raw: Buffer) {
	const headers = new Headers();
	let status = 200;

	for (const line of raw.toString('utf8').split(/\r?\n/)) {
		const separator = line.indexOf(':');
		if (separator === -1) continue;
		const name = line.slice(0, separator).trim();
		const value = line.slice(separator + 1).trim();
		if (name.toLowerCase() === 'status') {
			status = Number(value.split(' ')[0]) || 200;
		} else {
			headers.append(name, value);
		}
	}
	return { status, headers };
}

export interface BasicCredentials {
	username: string;
	password: string;
}

export function parseBasicAuth(header: string | null): BasicCredentials | null {
	if (!header?.startsWith('Basic ')) return null;
	try {
		const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
		const separator = decoded.indexOf(':');
		if (separator === -1) return null;
		return { username: decoded.slice(0, separator), password: decoded.slice(separator + 1) };
	} catch {
		return null;
	}
}

export function authRequired(message = 'Authentication required') {
	return new Response(message, {
		status: 401,
		headers: {
			'WWW-Authenticate': 'Basic realm="Kupfergit", charset="UTF-8"',
			'Content-Type': 'text/plain'
		}
	});
}

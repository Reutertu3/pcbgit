import fs from 'node:fs';
import { Readable } from 'node:stream';

/**
 * A file as a Response body. Converted with Readable.toWeb rather than passed as the
 * Node stream: undici wraps a Node stream in its own adapter, which can close it
 * again after the client has hung up, and that error is uncaught and ends the process.
 */
export function fileBody(file: string) {
	return Readable.toWeb(fs.createReadStream(file)) as ReadableStream<Uint8Array>;
}

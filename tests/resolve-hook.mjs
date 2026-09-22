/**
 * Lets `node --test` load the app's source directly.
 *
 * Vite resolves extensionless relative imports ('./sexpr') and the `$lib` alias;
 * plain Node does not. This hook teaches it both so the test runner can import
 * server modules without a build step.
 */
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const libRoot = path.join(projectRoot, 'src', 'lib');

registerHooks({
	resolve(specifier, context, nextResolve) {
		let target = specifier;

		if (target.startsWith('$lib')) {
			target = pathToFileURL(path.join(libRoot, target.slice('$lib'.length))).href;
		}

		const isRelative = target.startsWith('./') || target.startsWith('../');
		const isFileUrl = target.startsWith('file://');

		if (isRelative || isFileUrl) {
			const resolved = isFileUrl
				? fileURLToPath(target)
				: path.resolve(path.dirname(fileURLToPath(context.parentURL)), target);

			// './db' -> db.ts or db/index.ts; './db/index.ts' -> itself.
			const stem = resolved.replace(/\.ts$/, '');
			for (const candidate of [resolved, `${stem}.ts`, `${stem}.js`, path.join(stem, 'index.ts')]) {
				if (existsSync(candidate) && candidate.endsWith('.ts')) {
					return nextResolve(pathToFileURL(candidate).href, context);
				}
			}
		}

		return nextResolve(target, context);
	}
});

import { page } from '$app/state';

/**
 * The same URL, but on the address this visitor is using. One instance can be
 * reached as an IP, a hostname or localhost; clone URLs must show whichever the
 * visitor typed, not the one the server was configured with. Server rendering
 * still uses ORIGIN, and hydration corrects it.
 */
export function onThisHost(absolute: string) {
	try {
		return new URL(new URL(absolute).pathname, page.url.origin).href;
	} catch {
		return absolute;
	}
}

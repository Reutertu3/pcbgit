/**
 * Cross-site request protection.
 *
 * SvelteKit's built-in check compares a form post's Origin with the app's single
 * configured ORIGIN, which means one instance can only be reached at one address.
 * That is wrong for a LAN server, which is legitimately reached as an IP, a
 * hostname and localhost. This compares Origin with the Host of the same request
 * instead: a post must come from the address it was sent to.
 *
 * It is as strict as the original. A browser sets Origin itself and never lets a
 * page forge it, so a form on evil.example cannot post here. Setting Host by hand
 * only works outside a browser, where there are no cookies to abuse. A reverse
 * proxy must pass the client's Host through (Caddy's reverse_proxy does).
 */

/** Content types a cross-site form can send; other types need CORS, which we never grant. */
const FORM_TYPES = ['application/x-www-form-urlencoded', 'multipart/form-data', 'text/plain'];
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function isCrossSiteFormPost(request: Request): boolean {
	if (!UNSAFE_METHODS.has(request.method)) return false;

	const contentType = (request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
	if (!FORM_TYPES.includes(contentType)) return false;

	const host = request.headers.get('host');
	const origin = request.headers.get('origin');
	// Browsers always send Origin with these posts; something that omits it is not one.
	if (!host || !origin) return true;

	try {
		return new URL(origin).host !== host;
	} catch {
		return true;
	}
}

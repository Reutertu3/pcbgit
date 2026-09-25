import { error, redirect, type Handle } from '@sveltejs/kit';
import { getSessionUser, purgeExpiredSessions } from '$lib/server/auth';
import { ensureDirs } from '$lib/server/paths';
import { recoverStuckJobs, rerenderAfterRestore } from '$lib/server/render/worker';
import { bootstrap } from '$lib/server/bootstrap';
import { detectLocale, LOCALE_COOKIE } from '$lib/i18n';
import { isCrossSiteFormPost } from '$lib/server/csrf';

export const SESSION_COOKIE = 'pcbgit_session';

ensureDirs();

// SvelteKit rejects every form post whose Origin differs from ORIGIN, so a
// malformed value breaks login and registration while pages still load.
if (process.env.ORIGIN && !/^https?:\/\/[^/]+$/.test(process.env.ORIGIN)) {
	console.error(
		`[pcbgit] ORIGIN is "${process.env.ORIGIN}", which is not a plain origin like https://pcb.example.com. ` +
			'Form posts (login, registration, admin) will be rejected. Check PCBGIT_DOMAIN in .env.'
	);
}
bootstrap();
purgeExpiredSessions();
recoverStuckJobs();
rerenderAfterRestore();

export const handle: Handle = async ({ event, resolve }) => {
	// Replaces SvelteKit's ORIGIN-based check; see $lib/server/csrf.
	if (isCrossSiteFormPost(event.request)) error(403, 'error.crossSite');

	const sessionId = event.cookies.get(SESSION_COOKIE) ?? null;
	event.locals.sessionId = sessionId;
	event.locals.user = getSessionUser(sessionId ?? undefined);
	event.locals.locale = detectLocale(event.cookies.get(LOCALE_COOKIE), event.request.headers.get('accept-language'));

	// Guard the whole admin area here, not in a load function: SvelteKit runs
	// form actions before loads, so a load-only check leaves every action open.
	// Match the route, not the URL, so a user's pages can never fall under it.
	// The panel is at /admin-panel, a reserved username: /admin is the profile
	// of the default admin account, like any other user's.
	if (event.route.id === '/admin-panel' || event.route.id?.startsWith('/admin-panel/')) {
		if (!event.locals.user) {
			redirect(303, `/login?next=${encodeURIComponent(event.url.pathname)}`);
		}
		if (event.locals.user.role !== 'admin') {
			error(403, 'error.adminOnly');
		}
	}

	// The git endpoints speak their own protocol; SvelteKit must not touch the body.
	if (event.url.pathname.startsWith('/git/')) {
		return resolve(event);
	}

	const response = await resolve(event, {
		// Not fonts: each is split per script (latin, cyrillic, …) and the browser fetches
		// only the ones a page uses; preloading would download all of them.
		preload: ({ type }) => type === 'css' || type === 'js',
		transformPageChunk: ({ html }) => html.replace('%pcbgit.lang%', event.locals.locale)
	});
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'same-origin');
	// No framing by other sites (clickjacking). Rendered iBOM pages send their own
	// policy, which already includes this, so an existing one is left alone.
	response.headers.set('X-Frame-Options', 'SAMEORIGIN');
	if (!response.headers.has('Content-Security-Policy')) {
		response.headers.set('Content-Security-Policy', "frame-ancestors 'self'");
	}
	return response;
};

import { error, redirect, type Handle } from '@sveltejs/kit';
import { getSessionUser, purgeExpiredSessions } from '$lib/server/auth';
import { ensureDirs } from '$lib/server/paths';
import { recoverStuckJobs, rerenderAfterRestore } from '$lib/server/render/worker';
import { bootstrap } from '$lib/server/bootstrap';
import { detectLocale, LOCALE_COOKIE } from '$lib/i18n';

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
	const sessionId = event.cookies.get(SESSION_COOKIE) ?? null;
	event.locals.sessionId = sessionId;
	event.locals.user = getSessionUser(sessionId ?? undefined);
	event.locals.locale = detectLocale(event.cookies.get(LOCALE_COOKIE), event.request.headers.get('accept-language'));

	// Guard the whole admin area here, not in a load function: SvelteKit runs
	// form actions before loads, so a load-only check leaves every action open.
	// Match the route, not the URL: boards of a user named "admin" live at
	// /admin/<board> and must stay public.
	if (event.route.id === '/admin' || event.route.id?.startsWith('/admin/')) {
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
	return response;
};

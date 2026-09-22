import { error, redirect, type Handle } from '@sveltejs/kit';
import { getSessionUser, purgeExpiredSessions } from '$lib/server/auth';
import { ensureDirs } from '$lib/server/paths';
import { recoverStuckJobs, rerenderAfterRestore } from '$lib/server/render/worker';
import { bootstrap } from '$lib/server/bootstrap';

export const SESSION_COOKIE = 'pcbhub_session';

ensureDirs();
bootstrap();
purgeExpiredSessions();
recoverStuckJobs();
rerenderAfterRestore();

export const handle: Handle = async ({ event, resolve }) => {
	const sessionId = event.cookies.get(SESSION_COOKIE) ?? null;
	event.locals.sessionId = sessionId;
	event.locals.user = getSessionUser(sessionId ?? undefined);

	// Guard the whole admin area here, not in a load function: SvelteKit runs
	// form actions before loads, so a load-only check leaves every action open.
	if (event.url.pathname === '/admin' || event.url.pathname.startsWith('/admin/')) {
		if (!event.locals.user) {
			redirect(303, `/login?next=${encodeURIComponent(event.url.pathname)}`);
		}
		if (event.locals.user.role !== 'admin') {
			error(403, 'Administrator access required');
		}
	}

	// The git endpoints speak their own protocol; SvelteKit must not touch the body.
	if (event.url.pathname.startsWith('/git/')) {
		return resolve(event);
	}

	const response = await resolve(event, {
		preload: ({ type }) => type === 'font' || type === 'css' || type === 'js'
	});
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'same-origin');
	return response;
};

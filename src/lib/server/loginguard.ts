/**
 * Sign-in protection: where a login may send the browser afterwards, a limit on
 * failed attempts, and one on new accounts per address. Kept in memory: a restart
 * forgets the counters, which is fine for slowing down guessing and bots, and
 * needs no table.
 */

const SAME_SITE = 'http://pcbgit.invalid';

/**
 * Only same-site paths. "//host" and "/\host" are other sites to a browser, and
 * browsers drop tabs and newlines while parsing, so "/<tab>/host" is one too:
 * refuse control characters, whitespace and backslashes, then keep the path only
 * if resolving it stays on this site.
 */
export function safeNextPath(next: string | null | undefined) {
	if (!next || !next.startsWith('/') || /[\u0000-\u0020\u007f\\]/.test(next)) return '/';
	try {
		const url = new URL(next, SAME_SITE);
		return url.origin === SAME_SITE ? url.pathname + url.search + url.hash : '/';
	} catch {
		return '/';
	}
}

const WINDOW_MS = 15 * 60 * 1000;
/** Failed attempts allowed per window from one address, and against one account. */
const LIMITS = { ip: 10, account: 20 } as const;

const failures = new Map<string, number[]>();

function recent(key: string, now: number, log = failures, window = WINDOW_MS) {
	const times = (log.get(key) ?? []).filter((time) => now - time < window);
	if (times.length) log.set(key, times);
	else log.delete(key);
	return times;
}

/** Milliseconds until this address may try this account again; 0 when allowed. */
export function loginRetryAfter(ip: string, account: string, now = Date.now()) {
	let wait = 0;
	for (const [key, limit] of [[`ip:${ip}`, LIMITS.ip], [`account:${account}`, LIMITS.account]] as const) {
		const times = recent(key, now);
		if (times.length >= limit) wait = Math.max(wait, times[times.length - limit] + WINDOW_MS - now);
	}
	return wait;
}

export function recordLoginFailure(ip: string, account: string, now = Date.now()) {
	for (const key of [`ip:${ip}`, `account:${account}`]) failures.set(key, [...recent(key, now), now]);
	// Addresses that stop trying would otherwise stay in the map forever.
	if (failures.size > 10_000) for (const key of [...failures.keys()]) recent(key, now);
}

/** A successful sign-in clears the account's count, not the address's. */
export function clearLoginFailures(account: string) {
	failures.delete(`account:${account}`);
}

const REGISTRATION_WINDOW_MS = 60 * 60 * 1000;
/** Accounts one address may create per hour: a household or a class, not a bot. */
export const REGISTRATIONS_PER_ADDRESS = 3;

const registrations = new Map<string, number[]>();

/** Milliseconds until this address may create another account; 0 when allowed. */
export function registrationRetryAfter(ip: string, now = Date.now()) {
	const times = recent(ip, now, registrations, REGISTRATION_WINDOW_MS);
	if (times.length < REGISTRATIONS_PER_ADDRESS) return 0;
	return times[times.length - REGISTRATIONS_PER_ADDRESS] + REGISTRATION_WINDOW_MS - now;
}

export function recordRegistration(ip: string, now = Date.now()) {
	registrations.set(ip, [...recent(ip, now, registrations, REGISTRATION_WINDOW_MS), now]);
	if (registrations.size > 10_000) for (const key of [...registrations.keys()]) recent(key, now, registrations, REGISTRATION_WINDOW_MS);
}

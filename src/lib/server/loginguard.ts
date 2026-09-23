/**
 * Sign-in protection: where a login may send the browser afterwards, and a
 * limit on failed attempts. Kept in memory: a restart forgets the counters,
 * which is fine for slowing down guessing, and needs no table.
 */

/** Only same-site paths; "//host" and "/\host" are other sites to a browser. */
export function safeNextPath(next: string | null | undefined) {
	return next && /^\/(?![/\\])/.test(next) ? next : '/';
}

const WINDOW_MS = 15 * 60 * 1000;
/** Failed attempts allowed per window from one address, and against one account. */
const LIMITS = { ip: 10, account: 20 } as const;

const failures = new Map<string, number[]>();

function recent(key: string, now: number) {
	const times = (failures.get(key) ?? []).filter((time) => now - time < WINDOW_MS);
	if (times.length) failures.set(key, times);
	else failures.delete(key);
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

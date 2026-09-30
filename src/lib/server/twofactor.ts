/**
 * Optional two-factor sign-in with an authenticator app (TOTP), plus one-time
 * recovery codes. It guards the sign-in form only: a session, once made, lasts
 * as long as any other, and git keeps using access tokens.
 */
import crypto from 'node:crypto';
import { audit, count, get, getSetting, run } from './db';
import type { User } from './auth';
import { matchStep, newRecoveryCodes, newSecret, normalizeCode, recoveryHash } from './totp';

/** Holds the sign-in that passed the password and waits for a code. */
export const CHALLENGE_COOKIE = 'pcbgit_2fa';
export const CHALLENGE_TTL = 5 * 60 * 1000;
/** Wrong codes per password: then the password has to be entered again. */
const CHALLENGE_TRIES = 5;

/**
 * The owner's switch (Admin → Instance, off by default): with it on, an account
 * is only made admin with two-factor sign-in on, and an admin cannot turn it off.
 */
export function adminsNeedTwoFactor() {
	return getSetting('admins_require_2fa', 'false') === 'true';
}

/** The secret to show while setting up; made on first request, kept until confirmed or cancelled. */
export function pendingSecret(userId: string) {
	const current = get<{ totp_pending: string | null }>('SELECT totp_pending FROM users WHERE id = ?', userId);
	if (current?.totp_pending) return current.totp_pending;
	const secret = newSecret();
	run('UPDATE users SET totp_pending = ? WHERE id = ?', secret, userId);
	return secret;
}

export function cancelSetup(userId: string) {
	run('UPDATE users SET totp_pending = NULL WHERE id = ?', userId);
}

/** Turns two-factor on once a code from the new secret matches; returns the recovery codes, or null. */
export function enableTwoFactor(user: User, code: string) {
	if (!user.totp_pending) return null;
	const step = matchStep(user.totp_pending, normalizeCode(code), null);
	if (step === null) return null;
	run(
		'UPDATE users SET totp_secret = totp_pending, totp_pending = NULL, totp_last_step = ? WHERE id = ? AND totp_pending = ?',
		step,
		user.id,
		user.totp_pending
	);
	audit(user.id, 'auth.2fa_enable', user.username);
	return replaceRecoveryCodes(user.id);
}

/** For the account itself or an admin (lost phone); `actorId` is who did it, null for the command line. */
export function disableTwoFactor(user: Pick<User, 'id' | 'username'>, actorId: string | null) {
	run('UPDATE users SET totp_secret = NULL, totp_pending = NULL, totp_last_step = NULL WHERE id = ?', user.id);
	run('DELETE FROM recovery_codes WHERE user_id = ?', user.id);
	audit(actorId, actorId === user.id ? 'auth.2fa_disable' : 'admin.user_2fa_disable', user.username);
}

/** New codes invalidate the old ones; the clear text is returned only here. */
export function replaceRecoveryCodes(userId: string) {
	const codes = newRecoveryCodes();
	run('DELETE FROM recovery_codes WHERE user_id = ?', userId);
	for (const code of codes) run('INSERT INTO recovery_codes (user_id, code_hash) VALUES (?,?)', userId, recoveryHash(code));
	return codes;
}

export function recoveryCodesLeft(userId: string) {
	return count('SELECT COUNT(*) FROM recovery_codes WHERE user_id = ?', userId);
}

/**
 * Checks the second step of a sign-in: a current authenticator code, or an
 * unused recovery code (which is then used up). Both are spent with a
 * conditional write, so two requests racing with one code cannot both pass.
 */
export function verifySecondFactor(user: User, input: string): 'totp' | 'recovery' | null {
	if (!user.totp_secret) return null;
	const code = normalizeCode(input);
	const step = matchStep(user.totp_secret, code, user.totp_last_step);
	if (step !== null) {
		const spent = run(
			'UPDATE users SET totp_last_step = ? WHERE id = ? AND (totp_last_step IS NULL OR totp_last_step < ?)',
			step,
			user.id,
			step
		);
		return spent.changes ? 'totp' : null;
	}
	if (code.length !== 10) return null;
	const used = run('DELETE FROM recovery_codes WHERE user_id = ? AND code_hash = ?', user.id, recoveryHash(code));
	if (!used.changes) return null;
	audit(user.id, 'auth.2fa_recovery_used', user.username);
	return 'recovery';
}

/* ------------------------------------------------ pending sign-ins */

interface Challenge {
	userId: string;
	next: string;
	expires: number;
	tries: number;
}

// In memory like the sign-in limits: a restart only means entering the password again.
const challenges = new Map<string, Challenge>();

export function createChallenge(userId: string, next: string, now = Date.now()) {
	for (const [token, challenge] of challenges) if (challenge.expires <= now) challenges.delete(token);
	const token = crypto.randomBytes(32).toString('base64url');
	challenges.set(token, { userId, next, expires: now + CHALLENGE_TTL, tries: 0 });
	return token;
}

export function getChallenge(token: string | undefined, now = Date.now()) {
	const challenge = token ? challenges.get(token) : undefined;
	if (!challenge || challenge.expires <= now || challenge.tries >= CHALLENGE_TRIES) {
		if (token) challenges.delete(token);
		return null;
	}
	return challenge;
}

/** Counts a wrong code; false once the challenge is used up. */
export function failChallenge(token: string) {
	const challenge = challenges.get(token);
	if (!challenge) return false;
	challenge.tries += 1;
	if (challenge.tries < CHALLENGE_TRIES) return true;
	challenges.delete(token);
	return false;
}

export function endChallenge(token: string) {
	challenges.delete(token);
}

import crypto from 'node:crypto';
import { all, audit, get, newId, now, run } from './db';

export type Role = 'user' | 'admin';

export interface User {
	id: string;
	username: string;
	email: string;
	/** scrypt digest; never leaves the server. */
	password_hash: string;
	display_name: string;
	bio: string;
	role: Role;
	is_active: number;
	created_at: number;
	updated_at: number;
}

const SESSION_TTL = 1000 * 60 * 60 * 24 * 30;
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

export function hashPassword(password: string) {
	const salt = crypto.randomBytes(16);
	const key = crypto.scryptSync(password, salt, SCRYPT.keylen, SCRYPT);
	return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export function verifyPassword(password: string, stored: string) {
	const [scheme, n, r, p, salt, key] = stored.split('$');
	if (scheme !== 'scrypt') return false;
	const expected = Buffer.from(key, 'base64');
	const actual = crypto.scryptSync(password, Buffer.from(salt, 'base64'), expected.length, {
		N: Number(n),
		r: Number(r),
		p: Number(p)
	});
	return crypto.timingSafeEqual(expected, actual);
}

export function validateUsername(username: string) {
	if (!/^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/i.test(username)) {
		return 'validation.username' as const;
	}
	if (RESERVED.has(username.toLowerCase())) return 'validation.usernameReserved' as const;
	return null;
}

const RESERVED = new Set([
	'admin', 'api', 'git', 'login', 'logout', 'register', 'settings', 'new', 'browse',
	'about', 'static', 'assets', 'artifacts', 'tags', 'search', 'explore', 'help', 'docs'
]);

export function createUser(opts: {
	username: string;
	email: string;
	password: string;
	role?: Role;
	displayName?: string;
}) {
	const id = newId();
	const ts = now();
	run(
		`INSERT INTO users (id, username, email, password_hash, display_name, role, created_at, updated_at)
		 VALUES (?,?,?,?,?,?,?,?)`,
		id,
		opts.username,
		opts.email,
		hashPassword(opts.password),
		opts.displayName ?? opts.username,
		opts.role ?? 'user',
		ts,
		ts
	);
	return getUserById(id)!;
}

export function getUserById(id: string) {
	return get<User>('SELECT * FROM users WHERE id = ?', id);
}

export function getUserByUsername(username: string) {
	return get<User>('SELECT * FROM users WHERE username = ?', username);
}

export function findUserByLogin(login: string) {
	return get<User>('SELECT * FROM users WHERE username = ? OR email = ?', login, login);
}

export function createSession(userId: string, userAgent = '') {
	const id = crypto.randomBytes(32).toString('base64url');
	run(
		'INSERT INTO sessions (id, user_id, expires_at, created_at, user_agent) VALUES (?,?,?,?,?)',
		id,
		userId,
		now() + SESSION_TTL,
		now(),
		userAgent.slice(0, 200)
	);
	return { id, expiresAt: new Date(now() + SESSION_TTL) };
}

export function getSessionUser(sessionId: string | undefined) {
	if (!sessionId) return null;
	const row = get<User & { expires_at: number }>(
		`SELECT u.*, s.expires_at FROM sessions s
		 JOIN users u ON u.id = s.user_id
		 WHERE s.id = ? AND s.expires_at > ? AND u.is_active = 1`,
		sessionId,
		now()
	);
	return row ?? null;
}

export function destroySession(sessionId: string) {
	run('DELETE FROM sessions WHERE id = ?', sessionId);
}

export function destroyUserSessions(userId: string) {
	run('DELETE FROM sessions WHERE user_id = ?', userId);
}

export function purgeExpiredSessions() {
	run('DELETE FROM sessions WHERE expires_at < ?', now());
}

/* ---------------------------------------------------------------- tokens */

function tokenHash(token: string) {
	return crypto.createHash('sha256').update(token).digest('hex');
}

/** Returns the clear-text token once; only its hash is stored. */
export function createAccessToken(userId: string, name: string) {
	const token = `pcbgit_${crypto.randomBytes(24).toString('base64url')}`;
	run(
		'INSERT INTO access_tokens (id, user_id, name, token_hash, prefix, created_at) VALUES (?,?,?,?,?,?)',
		newId(),
		userId,
		name.slice(0, 80) || 'token',
		tokenHash(token),
		token.slice(0, 14),
		now()
	);
	audit(userId, 'token.create', name);
	return token;
}

export interface AccessTokenRow {
	id: string;
	name: string;
	prefix: string;
	last_used_at: number | null;
	created_at: number;
}

export function listAccessTokens(userId: string) {
	return all<AccessTokenRow>('SELECT id, name, prefix, last_used_at, created_at FROM access_tokens WHERE user_id = ? ORDER BY created_at DESC', userId);
}

export function revokeAccessToken(userId: string, tokenId: string) {
	run('DELETE FROM access_tokens WHERE id = ? AND user_id = ?', tokenId, userId);
	audit(userId, 'token.revoke', tokenId);
}

/** Authenticates `git push` over HTTP basic auth: username + access token. */
export function authenticateToken(username: string, token: string) {
	const row = get<{ user_id: string; id: string }>(
		'SELECT id, user_id FROM access_tokens WHERE token_hash = ?',
		tokenHash(token)
	);
	if (!row) return null;
	const user = getUserById(row.user_id);
	if (!user || !user.is_active) return null;
	if (username && user.username.toLowerCase() !== username.toLowerCase()) return null;
	run('UPDATE access_tokens SET last_used_at = ? WHERE id = ?', now(), row.id);
	return user;
}

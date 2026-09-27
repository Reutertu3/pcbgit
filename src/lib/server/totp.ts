/**
 * TOTP (RFC 6238) as authenticator apps expect it: SHA-1, 6 digits, 30-second
 * steps. No database here, so tests import it directly.
 */
import crypto from 'node:crypto';

const STEP_MS = 30_000;
const DIGITS = 6;
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
// No 0/o, 1/l/i: recovery codes get typed from paper.
const RECOVERY_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

/** 160 random bits, base32 as the apps take it. */
export function newSecret() {
	return toBase32(crypto.randomBytes(20));
}

export function toBase32(bytes: Buffer) {
	let bits = 0;
	let value = 0;
	let out = '';
	for (const byte of bytes) {
		value = (value << 8) | byte;
		bits += 8;
		while (bits >= 5) {
			out += BASE32[(value >>> (bits - 5)) & 31];
			bits -= 5;
		}
	}
	if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
	return out;
}

export function fromBase32(text: string) {
	const bytes: number[] = [];
	let bits = 0;
	let value = 0;
	for (const char of text.replace(/=+$/, '').toUpperCase()) {
		const index = BASE32.indexOf(char);
		if (index < 0) throw new Error('invalid base32');
		value = (value << 5) | index;
		bits += 5;
		if (bits >= 8) {
			bytes.push((value >>> (bits - 8)) & 255);
			bits -= 8;
		}
	}
	return Buffer.from(bytes);
}

export function hotp(key: Buffer, counter: number) {
	const message = Buffer.alloc(8);
	message.writeBigUInt64BE(BigInt(counter));
	const mac = crypto.createHmac('sha1', key).update(message).digest();
	const offset = mac[mac.length - 1] & 0xf;
	return String((mac.readUInt32BE(offset) & 0x7fffffff) % 10 ** DIGITS).padStart(DIGITS, '0');
}

/** Codes are often typed with a space in the middle ("123 456"). */
export function normalizeCode(input: string) {
	return input.replace(/[\s-]/g, '').toLowerCase();
}

/**
 * The time step `code` belongs to, allowing one step either way for clock drift;
 * null when it matches none. Steps up to `usedStep` are refused, so a code works
 * only once, even within its 30 seconds.
 */
export function matchStep(secret: string, code: string, usedStep: number | null, now = Date.now()) {
	if (!/^\d{6}$/.test(code)) return null;
	const key = fromBase32(secret);
	const current = Math.floor(now / STEP_MS);
	for (const step of [current - 1, current, current + 1]) {
		if (usedStep !== null && step <= usedStep) continue;
		if (crypto.timingSafeEqual(Buffer.from(hotp(key, step)), Buffer.from(code))) return step;
	}
	return null;
}

/** What the setup QR code holds. */
export function otpauthUri(issuer: string, account: string, secret: string) {
	const label = encodeURIComponent(`${issuer}:${account}`);
	const params = new URLSearchParams({ secret, issuer, algorithm: 'SHA1', digits: String(DIGITS), period: String(STEP_MS / 1000) });
	return `otpauth://totp/${label}?${params}`;
}

/** One-time codes for when the authenticator is gone: "xxxxx-xxxxx", about 49 bits each. */
export function newRecoveryCodes(count = 10) {
	return Array.from({ length: count }, () => {
		const chars = Array.from({ length: 10 }, () => RECOVERY_ALPHABET[crypto.randomInt(RECOVERY_ALPHABET.length)]);
		return `${chars.slice(0, 5).join('')}-${chars.slice(5).join('')}`;
	});
}

/** Stored instead of the code; the codes are random enough that a plain hash will do. */
export function recoveryHash(code: string) {
	return crypto.createHash('sha256').update(normalizeCode(code)).digest('hex');
}

/**
 * For an owner locked out of the web interface: sets a new random password,
 * turns two-factor sign-in off and ends every session. Nothing in the app can do
 * this for the owner, so it takes a shell on the server, which can reach the
 * database anyway.
 *
 *   docker compose exec pcbgit node --import ./tests/resolve-hook.mjs scripts/reset-owner.ts </dev/null
 *   npm run reset-owner     # outside Docker
 */
import crypto from 'node:crypto';
import { audit, get, now, run } from '../src/lib/server/db/index.ts';
import { destroyUserSessions, hashPassword, type User } from '../src/lib/server/auth.ts';
import { disableTwoFactor } from '../src/lib/server/twofactor.ts';

const owner = get<User>('SELECT * FROM users WHERE is_owner = 1');
if (!owner) {
	console.error('No owner account found. The app picks one at its next start.');
	process.exit(1);
}

const password = crypto.randomBytes(12).toString('base64url');
run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', hashPassword(password), now(), owner.id);
if (owner.totp_secret || owner.totp_pending) disableTwoFactor(owner, null);
destroyUserSessions(owner.id);
audit(null, 'admin.owner_reset', owner.username, 'command line');

console.log(`Owner:    ${owner.username}`);
console.log(`Password: ${password}`);
console.log('Two-factor sign-in is off and every session has ended.');
console.log('Sign in, then change the password under Settings.');

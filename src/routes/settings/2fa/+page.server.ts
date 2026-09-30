import { fail, redirect } from '@sveltejs/kit';
import { renderSVG } from 'uqr';
import { translate } from '$lib/i18n';
import type { Actions, PageServerLoad } from './$types';
import { getSetting } from '$lib/server/db';
import { destroyUserSessions, verifyPassword } from '$lib/server/auth';
import { otpauthUri } from '$lib/server/totp';
import {
	adminsNeedTwoFactor,
	cancelSetup,
	disableTwoFactor,
	enableTwoFactor,
	pendingSecret,
	recoveryCodesLeft,
	replaceRecoveryCodes
} from '$lib/server/twofactor';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) redirect(303, `/login?next=${encodeURIComponent(url.pathname)}`);
	const user = locals.user;
	// Also while it is on: a new authenticator is set up next to the one in use.
	const secret = user.totp_pending;
	const uri = secret ? otpauthUri(getSetting('site_name', 'pcbgit'), user.username, secret) : null;
	return {
		enabled: Boolean(user.totp_secret),
		// Where the owner requires it of admins, they keep it on; see `disable`.
		locked: user.role === 'admin' && adminsNeedTwoFactor(),
		recoveryLeft: user.totp_secret ? recoveryCodesLeft(user.id) : 0,
		// Grouped in fours for typing it in by hand.
		setup: secret && uri ? { secret: secret.match(/.{1,4}/g)!.join(' '), qr: renderSVG(uri, { border: 2 }) } : null
	};
};

export const actions: Actions = {
	start: async ({ locals }) => {
		if (!locals.user) return fail(401, { error: translate(locals.locale, 'error.signInFirst') });
		if (!locals.user.totp_secret) pendingSecret(locals.user.id);
		return {};
	},

	/**
	 * A new phone: the next secret is set up while the current one keeps working,
	 * and `enable` swaps them. Needed where admins cannot turn 2FA off and on again.
	 */
	replace: async ({ request, locals }) => {
		if (!locals.user?.totp_secret) return fail(401, { error: translate(locals.locale, 'error.signInFirst') });
		const password = String((await request.formData()).get('password') ?? '');
		if (!(await verifyPassword(password, locals.user.password_hash))) {
			return fail(401, { error: translate(locals.locale, 'account.error.currentPassword') });
		}
		pendingSecret(locals.user.id);
		return {};
	},

	cancel: async ({ locals }) => {
		if (!locals.user) return fail(401, { error: translate(locals.locale, 'error.signInFirst') });
		cancelSetup(locals.user.id);
		return {};
	},

	enable: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: translate(locals.locale, 'error.signInFirst') });
		const code = String((await request.formData()).get('code') ?? '');
		const replacing = Boolean(locals.user.totp_secret);
		const codes = enableTwoFactor(locals.user, code);
		if (!codes) return fail(400, { error: translate(locals.locale, 'twofactor.error.code') });
		// Other devices signed in with the password alone, or with the old authenticator.
		destroyUserSessions(locals.user.id, locals.sessionId ?? '');
		return { codes, message: translate(locals.locale, replacing ? 'twofactor.replaced' : 'twofactor.enabled') };
	},

	// These need the password, so an unattended signed-in browser cannot switch 2FA off.
	disable: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: translate(locals.locale, 'error.signInFirst') });
		// Where admins need 2FA, turning it off again would undo the check at promotion.
		if (locals.user.role === 'admin' && adminsNeedTwoFactor()) return fail(403, { error: translate(locals.locale, 'twofactor.error.admin') });
		const password = String((await request.formData()).get('password') ?? '');
		if (!(await verifyPassword(password, locals.user.password_hash))) {
			return fail(401, { error: translate(locals.locale, 'account.error.currentPassword') });
		}
		disableTwoFactor(locals.user, locals.user.id);
		return { message: translate(locals.locale, 'twofactor.disabled') };
	},

	recovery: async ({ request, locals }) => {
		if (!locals.user?.totp_secret) return fail(401, { error: translate(locals.locale, 'error.signInFirst') });
		const password = String((await request.formData()).get('password') ?? '');
		if (!(await verifyPassword(password, locals.user.password_hash))) {
			return fail(401, { error: translate(locals.locale, 'account.error.currentPassword') });
		}
		return { codes: replaceRecoveryCodes(locals.user.id), message: translate(locals.locale, 'twofactor.newCodes') };
	}
};

import type { Actions, PageServerLoad } from './$types';
import { translate } from '$lib/i18n';
import { audit, getSetting, setSetting } from '$lib/server/db';
import { fail } from '@sveltejs/kit';
import { resetKicadVersionCache } from '$lib/server/render/kicad';
import {
	autoUpdateEnabled,
	requestCheck,
	requestUpdate,
	runningVersion,
	setAutoUpdate,
	updateAvailability,
	updateState
} from '$lib/server/updater';

export const load: PageServerLoad = async () => ({
	settings: {
		siteName: getSetting('site_name', 'pcbgit'),
		siteTagline: getSetting('site_tagline', 'Self-hosted home for hardware design'),
		registrationOpen: getSetting('registration_open', 'true') === 'true'
	},
	version: runningVersion(),
	update: updateState(),
	availability: updateAvailability(),
	autoUpdate: autoUpdateEnabled()
});

export const actions: Actions = {
	save: async ({ request, locals }) => {
		const form = await request.formData();
		setSetting('site_name', String(form.get('site_name') ?? 'pcbgit').trim().slice(0, 60) || 'pcbgit');
		setSetting('site_tagline', String(form.get('site_tagline') ?? '').trim().slice(0, 160));
		setSetting('registration_open', form.get('registration_open') ? 'true' : 'false');
		audit(locals.user!.id, 'admin.settings_save');
		return { success: true, saved: true, message: translate(locals.locale, 'instance.saved') };
	},

	update: async ({ request, locals }) => {
		const force = (await request.formData()).get('force') === 'on';
		const state = updateState();
		if (!state) return fail(400, { error: translate(locals.locale, 'instance.error.notConfigured') });
		if (state.requested || state.status?.state === 'running') {
			return fail(409, { error: translate(locals.locale, 'instance.error.busy') });
		}
		requestUpdate(locals.user!.username, force);
		audit(locals.user!.id, 'admin.update_request', force ? 'forced reinstall' : 'update');
		return { success: true, message: translate(locals.locale, 'instance.requestedMessage') };
	},

	check: async ({ locals }) => {
		const availability = updateAvailability();
		if (!availability) return fail(400, { error: translate(locals.locale, 'instance.error.notConfigured') });
		if (!availability.checkRequested) requestCheck();
		audit(locals.user!.id, 'admin.update_check');
		return { success: true, message: translate(locals.locale, 'instance.checkingMessage') };
	},

	autoUpdate: async ({ request, locals }) => {
		if (!updateState()) return fail(400, { error: translate(locals.locale, 'instance.error.notConfigured') });
		const on = (await request.formData()).get('enabled') === 'true';
		setAutoUpdate(on, locals.user!.username);
		audit(locals.user!.id, 'admin.auto_update', on ? 'on' : 'off');
		return { success: true, message: translate(locals.locale, on ? 'instance.autoOnMessage' : 'instance.autoOffMessage') };
	},

	recheckKicad: async ({ locals }) => {
		resetKicadVersionCache();
		const { kicadVersion } = await import('$lib/server/render/kicad');
		const version = await kicadVersion();
		return {
			success: true,
			message: version ? translate(locals.locale, 'instance.kicadFound', { version }) : translate(locals.locale, 'instance.kicadMissing')
		};
	}
};

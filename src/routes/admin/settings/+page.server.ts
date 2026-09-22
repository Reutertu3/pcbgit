import type { Actions, PageServerLoad } from './$types';
import { audit, getSetting, setSetting } from '$lib/server/db';
import { fail } from '@sveltejs/kit';
import { resetKicadVersionCache } from '$lib/server/render/kicad';
import { requestCheck, requestUpdate, runningVersion, updateAvailability, updateState } from '$lib/server/updater';

export const load: PageServerLoad = async () => ({
	settings: {
		siteName: getSetting('site_name', 'pcbgit'),
		siteTagline: getSetting('site_tagline', 'Self-hosted home for hardware design'),
		registrationOpen: getSetting('registration_open', 'true') === 'true'
	},
	version: runningVersion(),
	update: updateState(),
	availability: updateAvailability()
});

export const actions: Actions = {
	save: async ({ request, locals }) => {
		const form = await request.formData();
		setSetting('site_name', String(form.get('site_name') ?? 'pcbgit').trim().slice(0, 60) || 'pcbgit');
		setSetting('site_tagline', String(form.get('site_tagline') ?? '').trim().slice(0, 160));
		setSetting('registration_open', form.get('registration_open') ? 'true' : 'false');
		audit(locals.user!.id, 'admin.settings_save');
		return { success: true, message: 'Instance settings saved.' };
	},

	update: async ({ request, locals }) => {
		const force = (await request.formData()).get('force') === 'on';
		const state = updateState();
		if (!state) return fail(400, { error: 'Updates are not configured on this server.' });
		if (state.requested || state.status?.state === 'running') {
			return fail(409, { error: 'An update is already requested or running.' });
		}
		requestUpdate(locals.user!.username, force);
		audit(locals.user!.id, 'admin.update_request', force ? 'forced rebuild' : 'pull');
		return { success: true, message: 'Update requested. The server pulls from GitHub and restarts if there is anything new.' };
	},

	check: async ({ locals }) => {
		const availability = updateAvailability();
		if (!availability) return fail(400, { error: 'Updates are not configured on this server.' });
		if (!availability.checkRequested) requestCheck();
		audit(locals.user!.id, 'admin.update_check');
		return { success: true, message: 'Checking GitHub for updates…' };
	},

	recheckKicad: async () => {
		resetKicadVersionCache();
		const { kicadVersion } = await import('$lib/server/render/kicad');
		const version = await kicadVersion();
		return {
			success: true,
			message: version ? `Found ${version}.` : 'kicad-cli is still not available on this server.'
		};
	}
};

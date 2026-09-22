import type { Actions, PageServerLoad } from './$types';
import { audit, getSetting, setSetting } from '$lib/server/db';
import { resetKicadVersionCache } from '$lib/server/render/kicad';

export const load: PageServerLoad = async () => ({
	settings: {
		siteName: getSetting('site_name', 'Kupfergit'),
		siteTagline: getSetting('site_tagline', 'Self-hosted home for hardware design'),
		registrationOpen: getSetting('registration_open', 'true') === 'true'
	}
});

export const actions: Actions = {
	save: async ({ request, locals }) => {
		const form = await request.formData();
		setSetting('site_name', String(form.get('site_name') ?? 'Kupfergit').trim().slice(0, 60) || 'Kupfergit');
		setSetting('site_tagline', String(form.get('site_tagline') ?? '').trim().slice(0, 160));
		setSetting('registration_open', form.get('registration_open') ? 'true' : 'false');
		audit(locals.user!.id, 'admin.settings_save');
		return { success: true, message: 'Instance settings saved.' };
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

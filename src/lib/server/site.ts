import { getSetting } from './db';

/**
 * The front page's headline and the text under it. An admin writes them under
 * Admin → Instance, and they are shown as written in every language: pcbgit
 * cannot translate an instance's own words. These are the defaults until then.
 */
export const DEFAULT_TAGLINE = 'Self-hosted home for hardware design';
export const DEFAULT_INTRO =
	'Push a KiCad project with git, and get schematics, a layered board view, an assembled 3D model, a bill of materials and a DRC report — rendered automatically and versioned for every commit.';

export function siteTexts() {
	return {
		tagline: getSetting('site_tagline', DEFAULT_TAGLINE),
		intro: getSetting('site_intro', DEFAULT_INTRO)
	};
}

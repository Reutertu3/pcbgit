/**
 * Licenses a board can be published under, with the few facts the interface
 * explains them by. The id is what the database stores (SPDX where one exists).
 * Boards may still carry ids that are no longer offered; they keep them.
 */
export type Sharing = 'strong' | 'same' | 'design' | 'none';

export interface LicenseInfo {
	id: string;
	/** Display name; translated for "All rights reserved". */
	name: string;
	url?: string;
	/** Undefined for "All rights reserved": nothing is permitted without asking. */
	commercial?: boolean;
	/** Whether changes must be shared: strong (also larger designs built on it), same license, this design only, or not at all. */
	sharing?: Sharing;
}

export const LICENSES: LicenseInfo[] = [
	// Written for hardware: strong, weak and permissive reciprocity.
	{ id: 'CERN-OHL-S-2.0', name: 'CERN-OHL-S 2.0', url: 'https://ohwr.org/cern_ohl_s_v2.txt', commercial: true, sharing: 'strong' },
	{ id: 'CERN-OHL-W-2.0', name: 'CERN-OHL-W 2.0', url: 'https://ohwr.org/cern_ohl_w_v2.txt', commercial: true, sharing: 'design' },
	{ id: 'CERN-OHL-P-2.0', name: 'CERN-OHL-P 2.0', url: 'https://ohwr.org/cern_ohl_p_v2.txt', commercial: true, sharing: 'none' },
	// Widespread for boards that ship with firmware.
	{ id: 'MIT', name: 'MIT', url: 'https://opensource.org/license/mit', commercial: true, sharing: 'none' },
	// What much of the maker scene uses; NC is not open hardware, but a legitimate choice.
	{ id: 'CC-BY-SA-4.0', name: 'CC BY-SA 4.0', url: 'https://creativecommons.org/licenses/by-sa/4.0/', commercial: true, sharing: 'same' },
	{ id: 'CC-BY-NC-SA-4.0', name: 'CC BY-NC-SA 4.0', url: 'https://creativecommons.org/licenses/by-nc-sa/4.0/', commercial: false, sharing: 'same' },
	// The stored id predates the wording; "Proprietary" rows keep working.
	{ id: 'Proprietary', name: 'All rights reserved' }
];

export const LICENSE_IDS = LICENSES.map((license) => license.id);

export function licenseInfo(id: string) {
	return LICENSES.find((license) => license.id === id);
}

/** Display name; `allRightsReserved` is the translated name for the stored "Proprietary". */
export function licenseName(id: string, allRightsReserved: string) {
	return id === 'Proprietary' ? allRightsReserved : (licenseInfo(id)?.name ?? id);
}

/** A value no longer offered still gets a link, when it looks like an SPDX id. */
export function licenseUrl(id: string) {
	return licenseInfo(id)?.url ?? (/^[A-Za-z0-9.+-]+$/.test(id) && id !== 'Proprietary' ? `https://spdx.org/licenses/${id}.html` : undefined);
}

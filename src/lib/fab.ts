/**
 * Board houses the fabrication ZIP can be made for. Every render makes one ZIP per
 * profile, so the download is a finished file whichever one a visitor picks.
 * A new board house is one more entry here, plus its name in the translations.
 */
export interface FabProfile {
	id: string;
	labelKey: 'fab.jlcpcb' | 'fab.aisler' | 'fab.generic';
	/** Protel file extensions (.gtl, .gbl, …): identify each layer whatever the board calls it. */
	protelExtensions: boolean;
	/** Remove silkscreen where the mask is open, instead of leaving it to the fab. */
	subtractSoldermask: boolean;
	drillUnits: 'mm' | 'in';
	/**
	 * The name a file gets in the ZIP, for board houses with a naming convention of
	 * their own. `part` is a layer id ("F.Cu") or "PTH"/"NPTH" for the drill files;
	 * null leaves the file out. Without it, kicad-cli's names are kept.
	 */
	fileName?: (board: string, part: string) => string | null;
}

/** AISLER's names for traditional Gerber uploads (community.aisler.net/t/99). */
const AISLER_LAYERS: Record<string, string> = {
	'F.Cu': 'toplayer',
	'B.Cu': 'bottomlayer',
	'F.Mask': 'topsoldermask',
	'B.Mask': 'bottomsoldermask',
	'F.SilkS': 'topsilkscreen',
	'B.SilkS': 'bottomsilkscreen',
	'F.Paste': 'toppaste',
	'B.Paste': 'bottompaste',
	'Edge.Cuts': 'boardoutline'
};

function aislerFileName(board: string, part: string) {
	if (part === 'PTH') return `${board}.drills_pth.xln`;
	if (part === 'NPTH') return `${board}.holes_npth.xln`;
	const inner = /^In(\d+)\.Cu$/.exec(part);
	const name = inner ? `internalplane${inner[1]}` : AISLER_LAYERS[part];
	return name ? `${board}.${name}.ger` : null;
}

export const FAB_PROFILES: FabProfile[] = [
	// JLCPCB's KiCad guide: Protel extensions, silkscreen clipped to the mask,
	// separate PTH/NPTH drill files in mm.
	{ id: 'jlcpcb', labelKey: 'fab.jlcpcb', protelExtensions: true, subtractSoldermask: true, drillUnits: 'mm' },
	// AISLER: its own file names, drill files in inches (2:4 precision).
	{ id: 'aisler', labelKey: 'fab.aisler', protelExtensions: false, subtractSoldermask: false, drillUnits: 'in', fileName: aislerFileName },
	// KiCad's own file names with Gerber X2 attributes, for fabs that read those.
	{ id: 'generic', labelKey: 'fab.generic', protelExtensions: false, subtractSoldermask: false, drillUnits: 'mm' }
];

export const DEFAULT_FAB = FAB_PROFILES[0].id;

export function fabProfile(id: string) {
	return FAB_PROFILES.find((profile) => profile.id === id);
}

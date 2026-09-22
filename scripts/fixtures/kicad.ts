/**
 * Generates small but structurally faithful KiCad 9 projects.
 *
 * These are synthetic demo boards, not captures of real hardware. They exist so
 * a fresh instance has something to browse and so the render pipeline can be
 * exercised end to end. They follow the documented s-expression layout
 * (dev-docs.kicad.org/en/file-formats/sexpr-pcb).
 */

let uuidCounter = 0;
/** Deterministic UUIDs keep generated fixtures byte-stable between runs. */
function uuid() {
	const n = (++uuidCounter).toString(16).padStart(12, '0');
	return `00000000-0000-4000-8000-${n}`;
}

export function resetUuids() {
	uuidCounter = 0;
}

export interface PartSpec {
	ref: string;
	value: string;
	footprint: string;
	description: string;
	mpn?: string;
	datasheet?: string;
	dnp?: boolean;
	/** Board placement in mm. */
	x: number;
	y: number;
	smd?: boolean;
	pads?: number;
}

export interface BoardSpec {
	name: string;
	title: string;
	widthMm: number;
	heightMm: number;
	originX?: number;
	originY?: number;
	copperLayers: 2 | 4;
	nets: string[];
	parts: PartSpec[];
	readme: string;
	description: string;
	tags: string[];
	license: string;
}

const LAYERS_2 = `
    (0 "F.Cu" signal)
    (2 "B.Cu" signal)
    (9 "F.Adhes" user "F.Adhesive")
    (11 "B.Adhes" user "B.Adhesive")
    (13 "F.Paste" user)
    (15 "B.Paste" user)
    (5 "F.SilkS" user "F.Silkscreen")
    (7 "B.SilkS" user "B.Silkscreen")
    (1 "F.Mask" user)
    (3 "B.Mask" user)
    (17 "Dwgs.User" user "User.Drawings")
    (19 "Cmts.User" user "User.Comments")
    (21 "Eco1.User" user "User.Eco1")
    (23 "Eco2.User" user "User.Eco2")
    (25 "Edge.Cuts" user)
    (27 "Margin" user)
    (31 "F.CrtYd" user "F.Courtyard")
    (29 "B.CrtYd" user "B.Courtyard")
    (35 "F.Fab" user)
    (33 "B.Fab" user)`;

const LAYERS_4 = `
    (0 "F.Cu" signal)
    (4 "In1.Cu" signal)
    (6 "In2.Cu" signal)
    (2 "B.Cu" signal)
    (9 "F.Adhes" user "F.Adhesive")
    (11 "B.Adhes" user "B.Adhesive")
    (13 "F.Paste" user)
    (15 "B.Paste" user)
    (5 "F.SilkS" user "F.Silkscreen")
    (7 "B.SilkS" user "B.Silkscreen")
    (1 "F.Mask" user)
    (3 "B.Mask" user)
    (17 "Dwgs.User" user "User.Drawings")
    (19 "Cmts.User" user "User.Comments")
    (21 "Eco1.User" user "User.Eco1")
    (23 "Eco2.User" user "User.Eco2")
    (25 "Edge.Cuts" user)
    (27 "Margin" user)
    (31 "F.CrtYd" user "F.Courtyard")
    (29 "B.CrtYd" user "B.Courtyard")
    (35 "F.Fab" user)
    (33 "B.Fab" user)`;

function escape(value: string) {
	return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function footprintBlock(part: PartSpec, netFor: (ref: string, pad: number) => [number, string]) {
	const padCount = part.pads ?? 2;
	const pads: string[] = [];
	// Two-terminal parts straddle the origin; multi-pin parts run along one edge.
	for (let pad = 1; pad <= padCount; pad++) {
		const [netId, netName] = netFor(part.ref, pad);
		const offset =
			padCount === 2 ? (pad === 1 ? -0.7875 : 0.7875) : -((padCount - 1) * 0.5) / 2 + (pad - 1) * 0.5;
		pads.push(
			`    (pad "${pad}" smd roundrect
      (at ${offset.toFixed(4)} 0)
      (size 0.875 0.95)
      (layers "F.Cu" "F.Paste" "F.Mask")
      (roundrect_rratio 0.25)
      (net ${netId} "${escape(netName)}")
      (uuid "${uuid()}")
    )`
		);
	}

	return `  (footprint "${escape(part.footprint)}"
    (layer "F.Cu")
    (uuid "${uuid()}")
    (at ${part.x} ${part.y})
    (descr "${escape(part.description)}")
    (attr ${part.smd === false ? 'through_hole' : 'smd'})
${part.dnp ? '    (attr dnp)\n' : ''}    (property "Reference" "${escape(part.ref)}"
      (at 0 -1.43 0)
      (layer "F.SilkS")
      (uuid "${uuid()}")
      (effects (font (size 0.8 0.8) (thickness 0.12)))
    )
    (property "Value" "${escape(part.value)}"
      (at 0 1.43 0)
      (layer "F.Fab")
      (uuid "${uuid()}")
      (effects (font (size 0.8 0.8) (thickness 0.12)))
    )
    (property "Footprint" "${escape(part.footprint)}"
      (at 0 0 0)
      (layer "F.Fab")
      (hide yes)
      (uuid "${uuid()}")
      (effects (font (size 1 1) (thickness 0.15)))
    )
    (property "Datasheet" "${escape(part.datasheet ?? '')}"
      (at 0 0 0)
      (layer "F.Fab")
      (hide yes)
      (uuid "${uuid()}")
      (effects (font (size 1 1) (thickness 0.15)))
    )
    (property "Description" "${escape(part.description)}"
      (at 0 0 0)
      (layer "F.Fab")
      (hide yes)
      (uuid "${uuid()}")
      (effects (font (size 1 1) (thickness 0.15)))
    )
    (fp_line (start -1.5 -0.7) (end 1.5 -0.7) (stroke (width 0.05) (type solid)) (layer "F.CrtYd") (uuid "${uuid()}"))
    (fp_line (start -1.5 0.7) (end 1.5 0.7) (stroke (width 0.05) (type solid)) (layer "F.CrtYd") (uuid "${uuid()}"))
    (fp_line (start -0.8 -0.4) (end 0.8 -0.4) (stroke (width 0.1) (type solid)) (layer "F.Fab") (uuid "${uuid()}"))
${pads.join('\n')}
  )`;
}

export function renderPcb(spec: BoardSpec) {
	resetUuids();
	const ox = spec.originX ?? 100;
	const oy = spec.originY ?? 80;
	const x2 = ox + spec.widthMm;
	const y2 = oy + spec.heightMm;

	const netIndex = new Map(spec.nets.map((net, i) => [net, i + 1]));
	const netFor = (ref: string, pad: number): [number, string] => {
		// Deterministic but varied: spreads pads across the declared nets.
		const hash = [...ref].reduce((sum, ch) => sum + ch.charCodeAt(0), pad);
		const name = spec.nets[hash % spec.nets.length];
		return [netIndex.get(name)!, name];
	};

	const outline = [
		`  (gr_line (start ${ox} ${oy}) (end ${x2} ${oy}) (stroke (width 0.1) (type default)) (layer "Edge.Cuts") (uuid "${uuid()}"))`,
		`  (gr_line (start ${x2} ${oy}) (end ${x2} ${y2}) (stroke (width 0.1) (type default)) (layer "Edge.Cuts") (uuid "${uuid()}"))`,
		`  (gr_line (start ${x2} ${y2}) (end ${ox} ${y2}) (stroke (width 0.1) (type default)) (layer "Edge.Cuts") (uuid "${uuid()}"))`,
		`  (gr_line (start ${ox} ${y2}) (end ${ox} ${oy}) (stroke (width 0.1) (type default)) (layer "Edge.Cuts") (uuid "${uuid()}"))`
	];

	// A few tracks and vias so the board is not an empty outline.
	const tracks: string[] = [];
	spec.parts.slice(0, -1).forEach((part, index) => {
		const next = spec.parts[index + 1];
		const [netId] = netFor(part.ref, 1);
		tracks.push(
			`  (segment (start ${part.x} ${part.y}) (end ${next.x} ${part.y}) (width 0.25) (layer "F.Cu") (net ${netId}) (uuid "${uuid()}"))`,
			`  (segment (start ${next.x} ${part.y}) (end ${next.x} ${next.y}) (width 0.25) (layer "F.Cu") (net ${netId}) (uuid "${uuid()}"))`
		);
		if (index % 3 === 0) {
			tracks.push(
				`  (via (at ${next.x} ${part.y}) (size 0.6) (drill 0.3) (layers "F.Cu" "B.Cu") (net ${netId}) (uuid "${uuid()}"))`
			);
		}
	});

	const silk = `  (gr_text "${escape(spec.title)}"
    (at ${ox + spec.widthMm / 2} ${y2 - 2} 0)
    (layer "F.SilkS")
    (uuid "${uuid()}")
    (effects (font (size 1.2 1.2) (thickness 0.2)))
  )`;

	return `(kicad_pcb
  (version 20241229)
  (generator "pcbhub-fixture")
  (generator_version "9.0")
  (general
    (thickness 1.6)
    (legacy_teardrops no)
  )
  (paper "A4")
  (title_block
    (title "${escape(spec.title)}")
    (company "PCBHub demo")
  )
  (layers${spec.copperLayers === 4 ? LAYERS_4 : LAYERS_2}
  )
  (setup
    (pad_to_mask_clearance 0)
    (allow_soldermask_bridges_in_footprints no)
    (pcbplotparams
      (layerselection 0x00000000_00000000_55555555_5755f5ff)
      (plot_on_all_layers_selection 0x00000000_00000000_00000000_00000000)
      (disableapertmacros no)
      (usegerberextensions no)
      (usegerberattributes yes)
      (usegerberadvancedattributes yes)
      (creategerberjobfile yes)
      (dashed_line_dash_ratio 12.000000)
      (dashed_line_gap_ratio 3.000000)
      (svgprecision 4)
      (plotframeref no)
      (mode 1)
      (useauxorigin no)
      (dxfpolygonmode yes)
      (dxfimperialunits yes)
      (dxfusepcbnewfont yes)
      (psnegative no)
      (psa4output no)
      (plot_black_and_white yes)
      (plotinvisibletext no)
      (sketchpadsonfab no)
      (plotpadnumbers no)
      (hidednponfab no)
      (sketchdnponfab yes)
      (crossoutdnponfab yes)
      (subtractmaskfromsilk no)
      (outputformat 1)
      (mirror no)
      (drillshape 1)
      (scaleselection 1)
      (outputdirectory "")
    )
  )
  (net 0 "")
${spec.nets.map((net, i) => `  (net ${i + 1} "${escape(net)}")`).join('\n')}
${spec.parts.map((part) => footprintBlock(part, netFor)).join('\n')}
${outline.join('\n')}
${silk}
${tracks.join('\n')}
)
`;
}

const FONT = '(effects (font (size 1.27 1.27)))';
const HIDDEN = '(effects (font (size 1.27 1.27)) (hide yes))';

function pin(number: string, x: number, y: number, angle: number, type = 'passive') {
	return `(pin ${type} line (at ${x} ${y} ${angle}) (length 1.27) (name "~" ${FONT}) (number "${number}" ${FONT}))`;
}

function libSymbol(id: string, prefix: string, body: string, pins: string[], power = false) {
	const name = id.split(':')[1];
	return `    (symbol "${id}"
      ${power ? '(power)' : ''}
      (pin_names (offset 0))
      (exclude_from_sim no)
      (in_bom ${power ? 'no' : 'yes'})
      (on_board ${power ? 'no' : 'yes'})
      (property "Reference" "${prefix}" (at 2.54 0 0) ${power ? HIDDEN : FONT})
      (property "Value" "${name}" (at 2.54 -2.54 0) ${FONT})
      (property "Footprint" "" (at 0 0 0) ${HIDDEN})
      (property "Datasheet" "~" (at 0 0 0) ${HIDDEN})
      (property "Description" "" (at 0 0 0) ${HIDDEN})
      (symbol "${name}_0_1" ${body})
      (symbol "${name}_1_1" ${pins.join(' ')})
    )`;
}

const STROKE = '(stroke (width 0.254) (type default)) (fill (type none))';

/** Definitions for every lib_id the fixtures place, keyed by lib_id. */
const LIB_SYMBOLS: Record<string, string> = {
	'Device:R': libSymbol('Device:R', 'R', `(rectangle (start -1.016 -2.54) (end 1.016 2.54) ${STROKE})`, [pin('1', 0, 3.81, 270), pin('2', 0, -3.81, 90)]),
	'Device:C': libSymbol(
		'Device:C',
		'C',
		`(polyline (pts (xy -2.032 -0.762) (xy 2.032 -0.762)) ${STROKE}) (polyline (pts (xy -2.032 0.762) (xy 2.032 0.762)) ${STROKE})`,
		[pin('1', 0, 3.81, 270), pin('2', 0, -3.81, 90)]
	),
	'Device:LED': libSymbol(
		'Device:LED',
		'D',
		`(polyline (pts (xy -1.27 -1.27) (xy -1.27 1.27) (xy 1.27 0) (xy -1.27 -1.27)) ${STROKE}) (polyline (pts (xy 1.27 -1.27) (xy 1.27 1.27)) ${STROKE})`,
		[pin('1', 3.81, 0, 180), pin('2', -3.81, 0, 0)]
	),
	'Device:U': libSymbol(
		'Device:U',
		'U',
		`(rectangle (start -5.08 -5.08) (end 5.08 5.08) ${STROKE})`,
		[pin('1', -7.62, 2.54, 0), pin('2', -7.62, -2.54, 0), pin('3', 7.62, 2.54, 180), pin('4', 7.62, -2.54, 180)]
	),
	'power:GND': libSymbol(
		'power:GND',
		'#PWR',
		`(polyline (pts (xy 0 0) (xy 0 -1.27) (xy 1.27 -1.27) (xy 0 -2.54) (xy -1.27 -1.27) (xy 0 -1.27)) ${STROKE})`,
		[pin('1', 0, 0, 270, 'power_in')],
		true
	)
};

export function renderSchematic(spec: BoardSpec) {
	resetUuids();

	const symbols = spec.parts
		.map((part, index) => {
			const x = 40 + (index % 6) * 30;
			const y = 40 + Math.floor(index / 6) * 30;
			const lib = part.ref.startsWith('R')
				? 'Device:R'
				: part.ref.startsWith('C')
					? 'Device:C'
					: part.ref.startsWith('D')
						? 'Device:LED'
						: 'Device:U';
			return `  (symbol
    (lib_id "${lib}")
    (at ${x} ${y} 0)
    (unit 1)
    (exclude_from_sim no)
    (in_bom yes)
    (on_board yes)
    (dnp ${part.dnp ? 'yes' : 'no'})
    (uuid "${uuid()}")
    (property "Reference" "${escape(part.ref)}"
      (at ${x + 2.5} ${y - 1.3} 0)
      (effects (font (size 1.27 1.27)) (justify left))
    )
    (property "Value" "${escape(part.value)}"
      (at ${x + 2.5} ${y + 1.3} 0)
      (effects (font (size 1.27 1.27)) (justify left))
    )
    (property "Footprint" "${escape(part.footprint)}"
      (at ${x} ${y} 0)
      (effects (font (size 1.27 1.27)) (hide yes))
    )
    (property "Datasheet" "${escape(part.datasheet ?? '~')}"
      (at ${x} ${y} 0)
      (effects (font (size 1.27 1.27)) (hide yes))
    )
    (property "Description" "${escape(part.description)}"
      (at ${x} ${y} 0)
      (effects (font (size 1.27 1.27)) (hide yes))
    )
    (property "MPN" "${escape(part.mpn ?? '')}"
      (at ${x} ${y} 0)
      (effects (font (size 1.27 1.27)) (hide yes))
    )
    (instances
      (project "${escape(spec.name)}"
        (path "/00000000-0000-4000-8000-000000000001" (reference "${escape(part.ref)}") (unit 1))
      )
    )
  )`;
		})
		.join('\n');

	// Power symbols carry a '#' reference and must never reach the BOM.
	const power = `  (symbol
    (lib_id "power:GND")
    (at 30 70 0)
    (unit 1)
    (in_bom yes)
    (on_board yes)
    (dnp no)
    (uuid "${uuid()}")
    (property "Reference" "#PWR01" (at 30 76 0) (effects (font (size 1.27 1.27)) (hide yes)))
    (property "Value" "GND" (at 30 75 0) (effects (font (size 1.27 1.27))))
    (instances
      (project "${escape(spec.name)}"
        (path "/00000000-0000-4000-8000-000000000001" (reference "#PWR01") (unit 1))
      )
    )
  )`;

	return `(kicad_sch
  (version 20250114)
  (generator "pcbhub-fixture")
  (generator_version "9.0")
  (uuid "00000000-0000-4000-8000-000000000001")
  (paper "A4")
  (title_block
    (title "${escape(spec.title)}")
    (company "PCBHub demo")
  )
  (lib_symbols
${Object.values(LIB_SYMBOLS).join('\n')}
  )
${symbols}
${power}
  (sheet_instances
    (path "/" (page "1"))
  )
)
`;
}

export function renderProjectFile(spec: BoardSpec) {
	return JSON.stringify(
		{
			board: { design_settings: { defaults: {} } },
			meta: { filename: `${spec.name}.kicad_pro`, version: 3 },
			pcbnew: { last_paths: {}, page_layout_descr_file: '' },
			schematic: { legacy_lib_dir: '', legacy_lib_list: [] },
			sheets: [['00000000-0000-4000-8000-000000000001', 'Root']],
			text_variables: {}
		},
		null,
		2
	);
}

/** The complete file set for one demo board, ready to commit. */
export function projectFiles(spec: BoardSpec) {
	return [
		{ path: `${spec.name}.kicad_pro`, data: Buffer.from(renderProjectFile(spec)) },
		{ path: `${spec.name}.kicad_sch`, data: Buffer.from(renderSchematic(spec)) },
		{ path: `${spec.name}.kicad_pcb`, data: Buffer.from(renderPcb(spec)) },
		{ path: 'README.md', data: Buffer.from(spec.readme) }
	];
}

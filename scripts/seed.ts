/**
 * Populates an instance with demo boards so a fresh deployment has something to
 * look at. The KiCad files are synthetic fixtures, not real hardware designs.
 *
 *   npm run seed            # add demo content
 *   npm run seed -- --reset # delete demo users first, then re-add
 *
 * Safe to skip entirely: a production instance needs none of this.
 */
import { all, count, get, run } from '../src/lib/server/db/index.ts';
import { createUser, getUserByUsername } from '../src/lib/server/auth.ts';
import { commitFiles, deleteRepo } from '../src/lib/server/git.ts';
import { repoPath } from '../src/lib/server/paths.ts';
import { createProject, getProject, syncCommits } from '../src/lib/server/projects.ts';
import { projectFiles, type BoardSpec } from './fixtures/kicad.ts';
import { bootstrap } from '../src/lib/server/bootstrap.ts';

const DEMO_USERS = [
	{ username: 'avaline', displayName: 'Ava Lindqvist', bio: 'Mixed-signal and low-power design. Mostly sensors.' },
	{ username: 'brnoc', displayName: 'Bruno Costa', bio: 'Motor control and power electronics.' },
	{ username: 'kestrel', displayName: 'Kes Tremaine', bio: 'RF, antennas, and things that should not oscillate.' }
];

interface DemoBoard {
	owner: string;
	slug: string;
	spec: BoardSpec;
	/** Extra commits applied on top, to give the history tab something to show. */
	revisions?: { message: string; mutate: (spec: BoardSpec) => BoardSpec }[];
}

const part = (
	ref: string,
	value: string,
	footprint: string,
	description: string,
	x: number,
	y: number,
	extra: Partial<BoardSpec['parts'][number]> = {}
) => ({ ref, value, footprint, description, x, y, ...extra });

const BOARDS: DemoBoard[] = [
	{
		owner: 'avaline',
		slug: 'sensor-hub',
		spec: {
			name: 'sensor-hub',
			title: 'Sensor Hub',
			widthMm: 45,
			heightMm: 32,
			copperLayers: 4,
			nets: ['GND', '+3V3', 'SDA', 'SCL', 'VBAT', 'USB_D+', 'USB_D-'],
			license: 'CERN-OHL-S-2.0',
			description:
				'Battery-powered I2C sensor node built around an ESP32-C3. USB-C charging, four sensor headers and a qwiic connector.',
			tags: ['ESP32', 'USB-C', 'I2C', 'Sensor', '4-layer'],
			parts: [
				part('U1', 'ESP32-C3-MINI-1', 'RF_Module:ESP32-C3-MINI-1', 'RISC-V SoC with 2.4 GHz radio', 110, 88, { mpn: 'ESP32-C3-MINI-1-N4', pads: 8, datasheet: 'https://www.espressif.com/sites/default/files/documentation/esp32-c3-mini-1_datasheet_en.pdf' }),
				part('U2', 'BQ24074', 'Package_DFN_QFN:VQFN-16', 'Li-ion charger with power path', 118, 96, { mpn: 'BQ24074RGTR', pads: 8 }),
				part('U3', 'SHT40', 'Package_DFN_QFN:DFN-4', 'Humidity and temperature sensor', 128, 88, { mpn: 'SHT40-AD1B-R2' }),
				part('J1', 'USB-C', 'Connector_USB:USB_C_Receptacle_HRO_TYPE-C-31-M-12', 'USB-C receptacle', 105, 100, { mpn: 'TYPE-C-31-M-12', pads: 8, smd: true }),
				part('R1', '10k', 'Resistor_SMD:R_0603_1608Metric', 'Thick film resistor 1%', 122, 86, { mpn: 'RC0603FR-0710KL' }),
				part('R2', '10k', 'Resistor_SMD:R_0603_1608Metric', 'Thick film resistor 1%', 124, 86, { mpn: 'RC0603FR-0710KL' }),
				part('R3', '5k1', 'Resistor_SMD:R_0603_1608Metric', 'Thick film resistor 1%', 126, 86, { mpn: 'RC0603FR-075K1L' }),
				part('R4', '5k1', 'Resistor_SMD:R_0603_1608Metric', 'Thick film resistor 1%', 128, 86, { mpn: 'RC0603FR-075K1L' }),
				part('C1', '10u', 'Capacitor_SMD:C_0805_2012Metric', 'MLCC X5R 16V', 132, 92, { mpn: 'GRM21BR61C106KE15L' }),
				part('C2', '100n', 'Capacitor_SMD:C_0402_1005Metric', 'MLCC X7R 25V', 134, 92, { mpn: 'CL05B104KO5NNNC' }),
				part('C3', '100n', 'Capacitor_SMD:C_0402_1005Metric', 'MLCC X7R 25V', 136, 92, { mpn: 'CL05B104KO5NNNC' }),
				part('D1', 'green', 'LED_SMD:LED_0603_1608Metric', 'Status LED', 140, 96, { mpn: 'LTST-C191KGKT' }),
				part('D2', 'amber', 'LED_SMD:LED_0603_1608Metric', 'Charge LED', 142, 96, { mpn: 'LTST-C191KAKT' }),
				part('SW1', 'BOOT', 'Button_Switch_SMD:SW_SPST_B3U-1000P', 'Tactile switch', 112, 104, { mpn: 'B3U-1000P' })
			],
			readme: `# Sensor Hub

A small battery-powered sensor node. ESP32-C3 for the radio, a BQ24074 for
charging and power path, and an SHT40 for baseline temperature and humidity.

## Highlights

- 45 x 32 mm, 4-layer stackup with a solid ground plane on In1
- USB-C with correct 5k1 CC pulldowns
- Qwiic-compatible I2C header for external sensors
- Runs about three weeks on a 500 mAh cell at one sample per minute

## Stackup

| Layer | Use            |
|-------|----------------|
| F.Cu  | Signal + parts |
| In1   | Ground plane   |
| In2   | +3V3 plane     |
| B.Cu  | Signal         |

> These files are demo fixtures generated for this instance, not a manufactured design.
`
		},
		revisions: [
			{
				message: 'Add charge status LED and second decoupling cap',
				mutate: (spec) => ({
					...spec,
					parts: [
						...spec.parts,
						part('C4', '100n', 'Capacitor_SMD:C_0402_1005Metric', 'MLCC X7R 25V', 138, 92, { mpn: 'CL05B104KO5NNNC' })
					]
				})
			},
			{
				message: 'Grow board 2 mm for the antenna keepout',
				mutate: (spec) => ({ ...spec, widthMm: 47 })
			}
		]
	},
	{
		owner: 'brnoc',
		slug: 'bldc-driver',
		spec: {
			name: 'bldc-driver',
			title: 'BLDC Driver 24V/15A',
			widthMm: 60,
			heightMm: 45,
			copperLayers: 4,
			nets: ['GND', '+24V', '+3V3', 'PHASE_A', 'PHASE_B', 'PHASE_C', 'CAN_H', 'CAN_L'],
			license: 'CERN-OHL-W-2.0',
			description:
				'Three-phase BLDC driver with field-oriented control on an STM32G4, CAN interface and inline current sensing.',
			tags: ['STM32', 'Motor driver', 'CAN', 'Power supply', '4-layer'],
			parts: [
				part('U1', 'STM32G431CBT6', 'Package_QFP:LQFP-48', 'Cortex-M4 with FMAC and CORDIC', 112, 90, { mpn: 'STM32G431CBT6', pads: 8 }),
				part('U2', 'DRV8353RS', 'Package_DFN_QFN:VQFN-40', 'Three-phase gate driver', 124, 90, { mpn: 'DRV8353RSRTAR', pads: 8 }),
				part('U3', 'TCAN332', 'Package_SO:SOIC-8', 'CAN transceiver', 136, 100, { mpn: 'TCAN332DR', pads: 8 }),
				part('Q1', 'BSC010N04LS', 'Package_TO_SOT_SMD:TDSON-8', 'N-channel MOSFET 40V', 116, 112, { mpn: 'BSC010N04LSATMA1' }),
				part('Q2', 'BSC010N04LS', 'Package_TO_SOT_SMD:TDSON-8', 'N-channel MOSFET 40V', 120, 112, { mpn: 'BSC010N04LSATMA1' }),
				part('Q3', 'BSC010N04LS', 'Package_TO_SOT_SMD:TDSON-8', 'N-channel MOSFET 40V', 124, 112, { mpn: 'BSC010N04LSATMA1' }),
				part('Q4', 'BSC010N04LS', 'Package_TO_SOT_SMD:TDSON-8', 'N-channel MOSFET 40V', 128, 112, { mpn: 'BSC010N04LSATMA1' }),
				part('Q5', 'BSC010N04LS', 'Package_TO_SOT_SMD:TDSON-8', 'N-channel MOSFET 40V', 132, 112, { mpn: 'BSC010N04LSATMA1' }),
				part('Q6', 'BSC010N04LS', 'Package_TO_SOT_SMD:TDSON-8', 'N-channel MOSFET 40V', 136, 112, { mpn: 'BSC010N04LSATMA1' }),
				part('R1', '1m', 'Resistor_SMD:R_2512_6332Metric', 'Current shunt 1%', 140, 108, { mpn: 'CSS2512FT1L00' }),
				part('R2', '1m', 'Resistor_SMD:R_2512_6332Metric', 'Current shunt 1%', 144, 108, { mpn: 'CSS2512FT1L00' }),
				part('R3', '120', 'Resistor_SMD:R_0805_2012Metric', 'CAN termination', 148, 100, { mpn: 'RC0805FR-07120RL' }),
				part('C1', '470u', 'Capacitor_SMD:CP_Elec_10x10.5', 'Bulk electrolytic 35V', 110, 118, { mpn: 'EEE-FK1V471P' }),
				part('C2', '10u', 'Capacitor_SMD:C_1210_3225Metric', 'MLCC X7R 50V', 114, 118, { mpn: 'CL32B106KBJNNNE' }),
				part('D1', 'red', 'LED_SMD:LED_0603_1608Metric', 'Fault LED', 152, 96, { mpn: 'LTST-C191KRKT' }),
				part('TP1', 'TEST', 'TestPoint:TestPoint_Pad_D1.5mm', 'Test pad', 154, 104, { dnp: true })
			],
			readme: `# BLDC Driver 24V / 15A

Field-oriented control of a three-phase brushless motor. STM32G4 does the maths,
a DRV8353 drives six MOSFETs, and inline shunts give phase current.

## Specifications

- 24 V nominal, 15 A continuous with airflow
- Inline current sensing on two phases
- CAN 2.0B, terminated on-board via R3
- 60 x 45 mm, 2 oz outer copper

## Known issues

- Thermal relief on the bulk cap pads makes hand soldering slow
- TP1 is marked DNP; it is a bring-up pad only

> Demo fixture files, generated for this instance.
`
		},
		revisions: [
			{ message: 'Second current shunt for phase B', mutate: (spec) => ({ ...spec, copperLayers: 4 }) }
		]
	},
	{
		owner: 'kestrel',
		slug: 'lora-relay',
		spec: {
			name: 'lora-relay',
			title: 'LoRa Relay',
			widthMm: 35,
			heightMm: 28,
			copperLayers: 2,
			nets: ['GND', '+3V3', 'RF_OUT', 'SPI_SCK', 'SPI_MOSI', 'SPI_MISO'],
			license: 'MIT',
			description:
				'Minimal 868 MHz LoRa relay node. SX1262, a coin cell holder and a printed meander antenna — nothing else.',
			tags: ['RF', 'SPI', 'Breakout', '2-layer'],
			parts: [
				part('U1', 'SX1262', 'Package_DFN_QFN:QFN-24-1EP_4x4mm', 'Sub-GHz LoRa transceiver', 108, 86, { mpn: 'SX1262IMLTRT', pads: 8 }),
				part('U2', 'ATSAMD21E18A', 'Package_QFP:TQFP-32', 'Cortex-M0+ microcontroller', 118, 86, { mpn: 'ATSAMD21E18A-AU', pads: 8 }),
				part('Y1', '32MHz', 'Crystal:Crystal_SMD_3225-4Pin_3.2x2.5mm', 'Crystal 32 MHz 10 ppm', 112, 94, { mpn: 'ABM8G-32.000MHZ' }),
				part('L1', '10n', 'Inductor_SMD:L_0402_1005Metric', 'RF matching inductor', 126, 90, { mpn: 'LQG15HS10NJ02' }),
				part('L2', '4n7', 'Inductor_SMD:L_0402_1005Metric', 'RF matching inductor', 128, 90, { mpn: 'LQG15HS4N7S02' }),
				part('C1', '100n', 'Capacitor_SMD:C_0402_1005Metric', 'MLCC X7R 16V', 122, 94, { mpn: 'CL05B104KO5NNNC' }),
				part('C2', '2p2', 'Capacitor_SMD:C_0402_1005Metric', 'MLCC C0G 50V', 130, 90, { mpn: 'CL05C2R2CB5NNNC' }),
				part('C3', '10u', 'Capacitor_SMD:C_0805_2012Metric', 'MLCC X5R 10V', 124, 98, { mpn: 'GRM21BR61A106KE19L' }),
				part('BT1', 'CR2032', 'Battery:BatteryHolder_Keystone_3000_1x12mm', 'Coin cell holder', 114, 102, { smd: false }),
				part('R1', '10k', 'Resistor_SMD:R_0402_1005Metric', 'Thick film resistor 1%', 132, 94, { mpn: 'RC0402FR-0710KL' })
			],
			readme: `# LoRa Relay

The smallest useful thing that repeats a LoRa packet. SX1262 plus a SAMD21,
running off a single CR2032.

- 35 x 28 mm, 2 layers
- Printed meander antenna, no connector
- Measured 7 uA in standby

> Demo fixture files, generated for this instance.
`
		}
	}
];

async function seed({ reset }: { reset: boolean }) {
	// Starter tags (and an admin) must exist: boards can only use existing tags.
	bootstrap();

	if (reset) {
		for (const demo of DEMO_USERS) {
			const user = getUserByUsername(demo.username);
			if (!user) continue;
			for (const project of all<{ slug: string }>('SELECT slug FROM projects WHERE owner_id = ?', user.id)) {
				await deleteRepo(user.username, project.slug);
			}
			run('DELETE FROM users WHERE id = ?', user.id);
			console.log(`removed demo user ${demo.username}`);
		}
	}

	for (const demo of DEMO_USERS) {
		if (getUserByUsername(demo.username)) continue;
		createUser({
			username: demo.username,
			email: `${demo.username}@example.invalid`,
			password: process.env.PCBGIT_SEED_PASSWORD ?? 'demo-password',
			displayName: demo.displayName
		});
		run('UPDATE users SET bio = ? WHERE username = ?', demo.bio, demo.username);
		console.log(`created demo user ${demo.username}`);
	}

	for (const board of BOARDS) {
		const owner = getUserByUsername(board.owner)!;
		if (getProject(owner.username, board.slug)) {
			console.log(`skipping ${owner.username}/${board.slug} — already present`);
			continue;
		}

		const project = await createProject({
			owner,
			slug: board.slug,
			name: board.spec.title,
			description: board.spec.description,
			license: board.spec.license,
			tags: board.spec.tags
		});

		const repo = repoPath(owner.username, board.slug);
		let spec = board.spec;
		await commitFiles(repo, projectFiles(spec), {
			message: 'Initial design',
			authorName: owner.display_name,
			authorEmail: owner.email,
			branch: 'main'
		});

		for (const revision of board.revisions ?? []) {
			spec = revision.mutate(spec);
			await commitFiles(repo, projectFiles(spec), {
				message: revision.message,
				authorName: owner.display_name,
				authorEmail: owner.email,
				branch: 'main'
			});
		}

		const result = await syncCommits(project, owner.username);
		console.log(`seeded ${owner.username}/${board.slug} with ${result.added} version(s)`);
	}

	// Cross-star so the browse page has something other than zeros.
	const users = DEMO_USERS.map((demo) => getUserByUsername(demo.username)!);
	const projects = all<{ id: string; owner_id: string }>('SELECT id, owner_id FROM projects');
	for (const user of users) {
		for (const project of projects) {
			if (project.owner_id === user.id) continue;
			run(
				'INSERT OR IGNORE INTO stars (user_id, project_id, created_at) VALUES (?,?,?)',
				user.id,
				project.id,
				Date.now()
			);
		}
	}

	console.log('\nWaiting for renders to finish…');
	const deadline = Date.now() + 10 * 60 * 1000;
	for (;;) {
		const pending = count("SELECT COUNT(*) FROM render_jobs WHERE status IN ('queued','running')");
		if (pending === 0) break;
		if (Date.now() > deadline) {
			console.warn('Timed out waiting for the render queue; jobs will continue in the app.');
			break;
		}
		await new Promise((resolve) => setTimeout(resolve, 500));
	}

	const failed = all<{ error: string }>("SELECT error FROM render_jobs WHERE status = 'failed'");
	console.log(
		`\nDone. ${count('SELECT COUNT(*) FROM projects')} board(s), ` +
			`${count('SELECT COUNT(*) FROM commits')} version(s), ${failed.length} failed render(s).`
	);
	for (const job of failed.slice(0, 5)) console.warn(`  render failed: ${job.error}`);
}

await seed({ reset: process.argv.includes('--reset') });

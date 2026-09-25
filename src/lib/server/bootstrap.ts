import { count, get, getSetting, now, run, setSetting } from './db';
import { createUser, getUserByUsername } from './auth';
import { ensureTag } from './projects';

/**
 * Runs on every boot.
 *
 * Defaults and starter tags are written once. The administrator check runs
 * every time on purpose: an instance that somehow has no active administrator
 * — seeded from a script, or with the last admin disabled — must never be left
 * with no way in.
 */
export function bootstrap() {
	seedDefaults();
	// Instances created before the rename still carry the old default name.
	if (['PCBHub', 'Kupfergit'].includes(getSetting('site_name'))) setSetting('site_name', 'pcbgit');
	backfillTagColors();
	ensureAdmin();
	ensureOwner();
}

/**
 * The instance's owner: an admin other admins cannot demote, disable, delete or
 * reset (admin/users). The one from .env if there is one, else the oldest active
 * admin; set once, here or when the first account registers.
 */
function ensureOwner() {
	if (count('SELECT COUNT(*) FROM users WHERE is_owner = 1') > 0) return;
	const preferred = getUserByUsername(process.env.PCBGIT_ADMIN_USER ?? 'admin');
	const owner =
		preferred?.role === 'admin' && preferred.is_active
			? preferred.id
			: get<{ id: string }>("SELECT id FROM users WHERE role = 'admin' AND is_active = 1 ORDER BY created_at LIMIT 1")?.id;
	if (owner) run('UPDATE users SET is_owner = 1 WHERE id = ?', owner);
}

/** Tags created before colours existed hold a placeholder name; give them their category's colour. */
function backfillTagColors() {
	run(
		`UPDATE tags SET color = COALESCE((SELECT color FROM tag_categories c WHERE c.id = tags.category), '#8a9a8b')
		 WHERE color NOT LIKE '#%'`
	);
}

function seedDefaults() {
	if (getSetting('bootstrapped') === 'true') return;

	setSetting('site_name', 'pcbgit');
	setSetting('site_tagline', 'Self-hosted home for hardware design');
	setSetting('registration_open', 'true');
	for (const [name, category] of STARTER_TAGS) ensureTag(name, category);

	setSetting('bootstrapped', 'true');
}

function ensureAdmin() {
	if (count("SELECT COUNT(*) FROM users WHERE role = 'admin' AND is_active = 1") > 0) return;

	const preferred = process.env.PCBGIT_ADMIN_USER ?? 'admin';
	const password = process.env.PCBGIT_ADMIN_PASSWORD ?? 'changeme';
	const email = process.env.PCBGIT_ADMIN_EMAIL ?? 'admin@localhost';

	// If the name is taken by an existing account, promote it rather than fail.
	const existing = getUserByUsername(preferred);
	if (existing) {
		promote(existing.id);
		console.warn(`[pcbgit] no active administrator found — promoted "${preferred}"`);
		return;
	}

	createUser({ username: preferred, email, password, role: 'admin', displayName: 'Administrator' });
	console.log(`[pcbgit] created administrator account "${preferred}"`);
	if (password === 'changeme') {
		console.warn('[pcbgit] the administrator password is the default — change it at /settings');
	}
}

function promote(userId: string) {
	run("UPDATE users SET role = 'admin', is_active = 1, updated_at = ? WHERE id = ?", now(), userId);
}

const STARTER_TAGS: [string, string][] = [
	['ESP32', 'component'],
	['STM32', 'component'],
	['RP2040', 'component'],
	['ATmega', 'component'],
	['FPGA', 'component'],
	['USB-C', 'interface'],
	['I2C', 'interface'],
	['SPI', 'interface'],
	['CAN', 'interface'],
	['Ethernet', 'interface'],
	['Power supply', 'domain'],
	['Motor driver', 'domain'],
	['Audio', 'domain'],
	['RF', 'domain'],
	['Sensor', 'domain'],
	['Breakout', 'domain'],
	['Dev board', 'domain'],
	['4-layer', 'process'],
	['2-layer', 'process'],
	['Flex', 'process'],
	['HDI', 'process']
];

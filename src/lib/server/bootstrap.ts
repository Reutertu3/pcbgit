import { count, getSetting, now, run, setSetting } from './db';
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
	ensureAdmin();
}

function seedDefaults() {
	if (getSetting('bootstrapped') === 'true') return;

	setSetting('site_name', 'PCBHub');
	setSetting('site_tagline', 'Self-hosted home for hardware design');
	setSetting('registration_open', 'true');
	for (const [name, category] of STARTER_TAGS) ensureTag(name, category);

	setSetting('bootstrapped', 'true');
}

function ensureAdmin() {
	if (count("SELECT COUNT(*) FROM users WHERE role = 'admin' AND is_active = 1") > 0) return;

	const preferred = process.env.PCBHUB_ADMIN_USER ?? 'admin';
	const password = process.env.PCBHUB_ADMIN_PASSWORD ?? 'changeme';
	const email = process.env.PCBHUB_ADMIN_EMAIL ?? 'admin@localhost';

	// If the name is taken by an existing account, promote it rather than fail.
	const existing = getUserByUsername(preferred);
	if (existing) {
		promote(existing.id);
		console.warn(`[pcbhub] no active administrator found — promoted "${preferred}"`);
		return;
	}

	createUser({ username: preferred, email, password, role: 'admin', displayName: 'Administrator' });
	console.log(`[pcbhub] created administrator account "${preferred}"`);
	if (password === 'changeme') {
		console.warn('[pcbhub] the administrator password is the default — change it at /settings');
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

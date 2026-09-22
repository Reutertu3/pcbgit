/** Translation files: same keys and placeholders in every language, no key used that does not exist. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const { LOCALES, translate, detectLocale } = await import('../src/lib/i18n/index.ts');

const dir = path.resolve(import.meta.dirname, '../src/lib/i18n');
type Message = string | { one: string; other: string };
const files = Object.fromEntries(
	Object.keys(LOCALES).map((locale) => [locale, JSON.parse(fs.readFileSync(path.join(dir, `${locale}.json`), 'utf8')) as Record<string, Message>])
);
const en = files.en;

/** {params} and [[slots]] a message uses, across its plural forms. */
function markers(message: Message) {
	const text = typeof message === 'string' ? message : `${message.one} ${message.other}`;
	return [...new Set(text.match(/\{\w+\}|\[\[\w+\]\]/g) ?? [])].sort();
}

test('every language has exactly the keys of en.json, with the same placeholders', () => {
	for (const [locale, messages] of Object.entries(files)) {
		assert.deepEqual(Object.keys(messages).sort(), Object.keys(en).sort(), `${locale}.json keys differ from en.json`);
		for (const [key, message] of Object.entries(messages)) {
			assert.equal(typeof message, typeof en[key], `${locale}:${key} plural shape`);
			// A plural's "one" form may spell out the count instead of using {count}.
			if (typeof message === 'string') assert.deepEqual(markers(message), markers(en[key]), `${locale}:${key} placeholders`);
		}
	}
});

test('every key the code asks for exists', () => {
	const sources: string[] = [];
	const walk = (folder: string) => {
		for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
			const full = path.join(folder, entry.name);
			if (entry.isDirectory()) walk(full);
			else if (/\.(svelte|ts)$/.test(entry.name)) sources.push(fs.readFileSync(full, 'utf8'));
		}
	};
	walk(path.resolve(import.meta.dirname, '../src'));

	const used = new Set<string>();
	const patterns = [
		/\bt(?:Parts)?\(\s*'([a-z0-9]+(?:\.[\w-]+)+)'/g, // t('a.b'), tParts('a.b')
		/translate\([^,]+,\s*'([a-z0-9]+(?:\.[\w-]+)+)'/g, // translate(locale, 'a.b')
		/Error\(\s*'([a-z0-9]+(?:\.[\w-]+)+)'/g, // new UploadError('a.b')
		/error\(\d{3},\s*'([a-z0-9]+(?:\.[\w-]+)+)'/g, // error(404, 'error.x')
		/'([a-z0-9]+(?:\.[\w-]+)+)' as const/g // keys picked in code, e.g. validators
	];
	for (const source of sources) for (const pattern of patterns) for (const match of source.matchAll(pattern)) used.add(match[1]);

	const missing = [...used].filter((key) => !(key in en));
	assert.deepEqual(missing, [], 'keys used in code but missing from en.json');
	assert.ok(used.size > 400, `scanner found only ${used.size} keys; the patterns are probably broken`);
});

test('plurals, placeholders and fallback', () => {
	assert.equal(translate('de', 'card.parts', { count: 1 }), '1 Bauteil');
	assert.equal(translate('de', 'card.parts', { count: 4 }), '4 Bauteile');
	assert.equal(translate('en', 'card.parts', { count: 0 }), '0 parts');
	assert.equal(translate('de', 'bom.compareWith', { sha: 'abc1234' }), 'Mit abc1234 vergleichen');
	assert.equal(translate('de', 'no.such.key' as never), 'no.such.key');
});

test('the saved choice wins, then the browser language, then English', () => {
	assert.equal(detectLocale('de', 'en-US'), 'de');
	assert.equal(detectLocale(undefined, 'fr-FR,de;q=0.8,en;q=0.5'), 'de');
	assert.equal(detectLocale('xx', 'fr-FR'), 'en');
	assert.equal(detectLocale(undefined, null), 'en');
});

/**
 * Translations. Each language is one flat JSON file next to this one: keys are
 * dotted names, values are strings with {placeholders}, or { "one", "other" }
 * for counts. en.json is the reference; every other file must have the same keys
 * (tests/i18n.test.ts checks). To add a language, copy en.json, translate it and
 * add it to LOCALES and MESSAGES below.
 */
import en from './en.json' with { type: 'json' };
import de from './de.json' with { type: 'json' };

export const LOCALES = { en: 'English', de: 'Deutsch' } as const;
export type Locale = keyof typeof LOCALES;
export type MessageKey = keyof typeof en;
export type Params = Record<string, string | number>;

type Message = string | { one: string; other: string };
const MESSAGES: Record<Locale, Record<string, Message>> = { en, de };

export const DEFAULT_LOCALE: Locale = 'en';
export const LOCALE_COOKIE = 'pcbgit-lang';

export function isLocale(value: unknown): value is Locale {
	return typeof value === 'string' && Object.hasOwn(LOCALES, value);
}

/** Looks up `key` in `locale`, falling back to English, and fills in {params}. */
export function translate(locale: Locale, key: MessageKey, params?: Params): string {
	const message = MESSAGES[locale][key] ?? MESSAGES.en[key] ?? key;
	const text =
		typeof message === 'string'
			? message
			: message[new Intl.PluralRules(locale).select(Number(params?.count ?? 0)) === 'one' ? 'one' : 'other'];
	return params ? text.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match)) : text;
}

/** The saved choice, else the browser's preferred supported language, else English. */
export function detectLocale(saved: string | undefined, acceptLanguage: string | null): Locale {
	if (isLocale(saved)) return saved;
	for (const part of (acceptLanguage ?? '').split(',')) {
		const code = part.split(';')[0].trim().slice(0, 2).toLowerCase();
		if (isLocale(code)) return code;
	}
	return DEFAULT_LOCALE;
}

/**
 * An error whose message is shown to users. It carries a key so the route that
 * catches it can translate it into the viewer's language.
 */
export class UserError extends Error {
	readonly key: MessageKey;
	readonly params?: Params;

	constructor(key: MessageKey, params?: Params) {
		super(translate(DEFAULT_LOCALE, key, params));
		this.key = key;
		this.params = params;
	}

	in(locale: Locale) {
		return translate(locale, this.key, this.params);
	}
}

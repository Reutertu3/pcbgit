/**
 * Translation for components. The language comes from the page data, which is
 * per request during server rendering and reactive in the browser, so switching
 * language re-renders every string without passing anything down.
 */
import { page } from '$app/state';
import { DEFAULT_LOCALE, isLocale, translate, type Locale, type MessageKey, type Params } from '.';

export function locale(): Locale {
	const value = page.data.locale;
	return isLocale(value) ? value : DEFAULT_LOCALE;
}

export function t(key: MessageKey, params?: Params) {
	return translate(locale(), key, params);
}

/**
 * A message split around its [[slots]], for sentences that wrap a link or a styled
 * word: each language keeps its own word order and the component fills the slots.
 * "Use [[user]] and a [[token]]." → ['Use ', { slot: 'user' }, ' and a ', { slot: 'token' }, '.']
 */
export function tParts(key: MessageKey, params?: Params): (string | { slot: string })[] {
	return t(key, params)
		.split(/(\[\[\w+\]\])/)
		.filter(Boolean)
		.map((part) => (/^\[\[\w+\]\]$/.test(part) ? { slot: part.slice(2, -2) } : part));
}

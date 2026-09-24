import type { MessageKey } from '$lib/i18n';
import { t } from '$lib/i18n/t';

/** A category's name: the admin's if one was given, else the built-in translation, else its id. */
export function categoryLabel(id: string, name = '') {
	if (name) return name;
	const key = `tagCategory.${id}` as MessageKey;
	const text = t(key);
	return text === key ? id : text;
}

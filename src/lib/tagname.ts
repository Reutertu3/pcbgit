/**
 * A tag name reduced to what tells tags apart: no case, spaces or punctuation,
 * so ESP32S3, esp32 s3 and ESP32-S3 are one name, as are USBC and USB-C.
 */
export function normalizeTagName(name: string) {
	return name
		.normalize('NFKD')
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, '');
}

/** The tag among `tags` that `name` would duplicate, if any. */
export function sameTag<T extends { name: string; slug: string }>(tags: T[], name: string) {
	const wanted = normalizeTagName(name);
	if (!wanted) return undefined;
	return tags.find((tag) => normalizeTagName(tag.name) === wanted || normalizeTagName(tag.slug) === wanted);
}

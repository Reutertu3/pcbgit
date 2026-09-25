/**
 * Sizes written the way BODY_SIZE_LIMIT is: bytes, or a number with K, M or G
 * (powers of 1024), e.g. 512K, 210M, 2G. No imports, so tests can use it alone.
 */
export function parseByteSize(value: string): number | null {
	const match = /^(\d+(?:\.\d+)?)\s*([KMG]?)B?$/i.exec(value.trim());
	if (!match) return null;
	const unit = { '': 1, K: 1024, M: 1024 ** 2, G: 1024 ** 3 }[match[2].toUpperCase() as '' | 'K' | 'M' | 'G'];
	return Math.floor(Number(match[1]) * unit);
}

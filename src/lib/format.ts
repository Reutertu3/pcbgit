export function shortSha(sha: string | null | undefined) {
	return (sha ?? '').slice(0, 7);
}

export function relativeTime(timestamp: number | null | undefined) {
	if (!timestamp) return 'never';
	const seconds = Math.round((Date.now() - timestamp) / 1000);
	const future = seconds < 0;
	const abs = Math.abs(seconds);

	const units: [number, Intl.RelativeTimeFormatUnit][] = [
		[60, 'second'],
		[3600, 'minute'],
		[86400, 'hour'],
		[604800, 'day'],
		[2629800, 'week'],
		[31557600, 'month']
	];

	if (abs < 45) return future ? 'in a moment' : 'just now';
	for (let i = 0; i < units.length; i++) {
		const [limit, unit] = units[i];
		if (abs < limit) {
			const divisor = i === 0 ? 1 : units[i - 1][0];
			const value = Math.round(abs / divisor);
			return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(
				future ? value : -value,
				unit
			);
		}
	}
	const years = Math.round(abs / 31557600);
	return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(future ? years : -years, 'year');
}

export function formatDate(timestamp: number | null | undefined) {
	if (!timestamp) return '—';
	return new Date(timestamp).toLocaleDateString('en-US', {
		year: 'numeric',
		month: 'short',
		day: 'numeric'
	});
}

export function formatDateTime(timestamp: number | null | undefined) {
	if (!timestamp) return '—';
	return new Date(timestamp).toLocaleString('en-US', {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit'
	});
}

export function formatBytes(bytes: number | null | undefined) {
	if (!bytes) return '0 B';
	const units = ['B', 'KB', 'MB', 'GB'];
	const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
	const value = bytes / Math.pow(1024, exponent);
	return `${value.toFixed(exponent === 0 ? 0 : value >= 100 ? 0 : 1)} ${units[exponent]}`;
}

export function formatDimensions(width: number | null, height: number | null) {
	if (!width || !height) return null;
	return `${width.toFixed(1)} × ${height.toFixed(1)} mm`;
}

export function formatCount(value: number) {
	if (value < 1000) return String(value);
	if (value < 1_000_000) return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)}k`;
	return `${(value / 1_000_000).toFixed(1)}M`;
}

/** Deterministic hue from a string, for avatar and tag colours. */
export function hueFor(value: string) {
	let hash = 0;
	for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
	return hash % 360;
}

export function initials(name: string) {
	const parts = name.trim().split(/[\s._-]+/).filter(Boolean);
	if (!parts.length) return '?';
	return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

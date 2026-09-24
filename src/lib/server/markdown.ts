/**
 * A deliberately small Markdown subset renderer. Input is escaped before any
 * rules run, so no author-supplied HTML can ever reach the page.
 */
import { posix } from 'node:path';

const ESCAPES: Record<string, string> = {
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;',
	'"': '&quot;',
	"'": '&#39;'
};

function escapeHtml(text: string) {
	return text.replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

/** Only http(s), mailto and same-origin links survive. */
function safeUrl(url: string) {
	const trimmed = url.trim();
	if (/^(https?:\/\/|mailto:|\/|#|\.\/)/i.test(trimmed)) return trimmed;
	return '#';
}

/** Undoes escapeHtml, for a path that is about to be URL-encoded instead. */
function unescapeHtml(text: string) {
	return text.replace(/&(amp|lt|gt|quot|#39);/g, (entity) => Object.keys(ESCAPES).find((char) => ESCAPES[char] === entity)!);
}

function decodeSegment(segment: string) {
	try {
		return decodeURIComponent(segment);
	} catch {
		return segment;
	}
}

/**
 * Image sources. Relative paths are files in the repository, resolved from its root
 * (where the README is) and served from `imageBase`; without one, or when a path
 * climbs out of the repository, they go nowhere. Other URLs follow safeUrl.
 */
function imageUrl(src: string, imageBase?: string) {
	const url = unescapeHtml(src.trim());
	if (!imageBase || /^(https?:\/\/|mailto:|\/|#)/i.test(url)) return safeUrl(src);
	if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return '#';
	const resolved = posix.normalize(url.split(/[?#]/)[0]).replace(/^\.\//, '');
	if (!resolved || resolved === '.' || resolved === '..' || resolved.startsWith('../')) return '#';
	// Authors write spaces as %20 (Markdown allows no whitespace there): decode, then encode once.
	return escapeHtml(imageBase + resolved.split('/').map((segment) => encodeURIComponent(decodeSegment(segment))).join('/'));
}

function inline(text: string, imageBase?: string) {
	return (
		text
			// Code spans first: their contents must not be touched by later rules.
			.replace(/`([^`]+)`/g, (_, code) => `<code>${code}</code>`)
			.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, src) => `<img src="${imageUrl(src, imageBase)}" alt="${alt}" loading="lazy">`)
			.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => {
				const url = safeUrl(href);
				const external = /^https?:/i.test(url);
				return `<a href="${url}"${external ? ' rel="nofollow noopener" target="_blank"' : ''}>${label}</a>`;
			})
			.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, (_, lead, url) => `${lead}<a href="${url}" rel="nofollow noopener" target="_blank">${url}</a>`)
			.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
			.replace(/(^|\W)_([^_]+)_(?=\W|$)/g, '$1<em>$2</em>')
			.replace(/\*([^*]+)\*/g, '<em>$1</em>')
			.replace(/~~([^~]+)~~/g, '<del>$1</del>')
	);
}

/** `imageBase`: where the repository's files are served, for relative image paths. */
export function renderMarkdown(source: string, options: { imageBase?: string } = {}) {
	const lines = escapeHtml(source.replace(/\r\n/g, '\n')).split('\n');
	const out: string[] = [];
	let listType: 'ul' | 'ol' | null = null;
	let inCode = false;
	let inTable = false;
	let paragraph: string[] = [];

	const closeList = () => {
		if (listType) {
			out.push(`</${listType}>`);
			listType = null;
		}
	};
	const closeParagraph = () => {
		if (paragraph.length) {
			out.push(`<p>${inline(paragraph.join(' '), options.imageBase)}</p>`);
			paragraph = [];
		}
	};
	const closeTable = () => {
		if (inTable) {
			out.push('</tbody></table>');
			inTable = false;
		}
	};
	const closeAll = () => {
		closeParagraph();
		closeList();
		closeTable();
	};

	for (const line of lines) {
		if (/^\s*```/.test(line)) {
			closeAll();
			out.push(inCode ? '</code></pre>' : '<pre><code>');
			inCode = !inCode;
			continue;
		}
		if (inCode) {
			out.push(line);
			continue;
		}

		if (!line.trim()) {
			closeAll();
			continue;
		}

		const heading = /^(#{1,6})\s+(.*)$/.exec(line);
		if (heading) {
			closeAll();
			const level = heading[1].length;
			out.push(`<h${level}>${inline(heading[2], options.imageBase)}</h${level}>`);
			continue;
		}

		if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(line)) {
			closeAll();
			out.push('<hr>');
			continue;
		}

		// The source was escaped up front, so a blockquote marker arrives as "&gt;".
		const quote = /^&gt;\s?(.*)$/.exec(line);
		if (quote) {
			closeAll();
			out.push(`<blockquote>${inline(quote[1], options.imageBase)}</blockquote>`);
			continue;
		}

		// Tables: a header row followed by a separator row of dashes.
		if (line.includes('|') && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(line) && paragraph.length) {
			const header = paragraph.pop()!;
			closeParagraph();
			out.push('<table><thead><tr>');
			for (const cell of splitRow(header)) out.push(`<th>${inline(cell, options.imageBase)}</th>`);
			out.push('</tr></thead><tbody>');
			inTable = true;
			continue;
		}
		if (inTable && line.includes('|')) {
			out.push('<tr>');
			for (const cell of splitRow(line)) out.push(`<td>${inline(cell, options.imageBase)}</td>`);
			out.push('</tr>');
			continue;
		}
		closeTable();

		const bullet = /^\s*[-*+]\s+(.*)$/.exec(line);
		const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
		if (bullet || numbered) {
			closeParagraph();
			const wanted = bullet ? 'ul' : 'ol';
			if (listType !== wanted) {
				closeList();
				out.push(`<${wanted}>`);
				listType = wanted;
			}
			out.push(`<li>${inline((bullet ?? numbered)![1], options.imageBase)}</li>`);
			continue;
		}
		closeList();

		paragraph.push(line.trim());
	}

	if (inCode) out.push('</code></pre>');
	closeAll();
	return out.join('\n');
}

function splitRow(row: string) {
	return row
		.replace(/^\s*\|/, '')
		.replace(/\|\s*$/, '')
		.split('|')
		.map((cell) => cell.trim());
}

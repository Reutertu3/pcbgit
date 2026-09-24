/**
 * A small XML reader for Eagle files, which are plain, well-formed XML. Written
 * for untrusted input: entities are never expanded (only the five predefined ones
 * and character references are decoded), a DOCTYPE that declares its own is
 * refused, and size, depth and element count are capped. No `$lib` imports: the
 * converter runs in the renderer with plain Node.
 */

export interface XmlElement {
	tag: string;
	attrs: Record<string, string>;
	children: XmlElement[];
	text: string;
}

export class XmlError extends Error {}

export const XML_LIMITS = { bytes: 32 * 1024 * 1024, depth: 64, elements: 2_000_000 };

const TOKEN =
	/<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<!DOCTYPE([^>[]*)(\[)?[^>]*>|<\/([\w:.-]+)\s*>|<([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)|(<)/g;
const ATTR = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

export function parseXml(source: string, limits = XML_LIMITS): XmlElement {
	if (source.length > limits.bytes) throw new XmlError('file too large');
	const root: XmlElement = { tag: '#document', attrs: {}, children: [], text: '' };
	const stack = [root];
	let elements = 0;
	TOKEN.lastIndex = 0;
	for (let m = TOKEN.exec(source); m; m = TOKEN.exec(source)) {
		const [, cdata, , internalSubset, close, open, attrText, selfClosing, text, stray] = m;
		if (internalSubset) throw new XmlError('DOCTYPE with declarations is not accepted');
		if (stray) throw new XmlError('malformed markup');
		if (close) {
			if (stack.length < 2 || stack.at(-1)!.tag !== close) throw new XmlError(`unexpected </${close}>`);
			stack.pop();
		} else if (open) {
			if (++elements > limits.elements) throw new XmlError('too many elements');
			const attrs: Record<string, string> = {};
			for (const a of attrText.matchAll(ATTR)) attrs[a[1]] = decode(a[2] ?? a[3]);
			const element: XmlElement = { tag: open, attrs, children: [], text: '' };
			stack.at(-1)!.children.push(element);
			if (!selfClosing) {
				if (stack.length > limits.depth) throw new XmlError('nested too deeply');
				stack.push(element);
			}
		} else if (text !== undefined || cdata !== undefined) {
			if (stack.length > 1) stack.at(-1)!.text += cdata ?? decode(text!);
		}
	}
	if (stack.length !== 1) throw new XmlError(`unclosed <${stack.at(-1)!.tag}>`);
	return root;
}

const NAMED: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

function decode(value: string) {
	return value.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (match, ref: string) => {
		if (ref[0] !== '#') return NAMED[ref] ?? match;
		const code = ref[1] === 'x' || ref[1] === 'X' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
		const valid = code === 0x9 || code === 0xa || code === 0xd || (code >= 0x20 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff));
		return valid ? String.fromCodePoint(code) : '';
	});
}

export const children = (e: XmlElement | undefined, tag: string) => (e ? e.children.filter((c) => c.tag === tag) : []);
export const child = (e: XmlElement | undefined, tag: string) => e?.children.find((c) => c.tag === tag);

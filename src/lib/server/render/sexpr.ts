/**
 * Minimal reader for KiCad's s-expression files (.kicad_pcb, .kicad_sch, .kicad_pro).
 * Enough to pull out board statistics and a symbol list without running KiCad.
 */

export type SNode = string | SNode[];

export function parseSexpr(text: string): SNode[] {
	const stack: SNode[][] = [[]];
	let i = 0;
	const len = text.length;

	while (i < len) {
		const ch = text[i];

		if (ch === '(') {
			const node: SNode[] = [];
			stack[stack.length - 1].push(node);
			stack.push(node);
			i++;
		} else if (ch === ')') {
			if (stack.length > 1) stack.pop();
			i++;
		} else if (ch === '"') {
			let out = '';
			i++;
			while (i < len && text[i] !== '"') {
				if (text[i] === '\\') {
					const next = text[i + 1];
					out += next === 'n' ? '\n' : next === 't' ? '\t' : next;
					i += 2;
				} else {
					out += text[i++];
				}
			}
			i++;
			stack[stack.length - 1].push(out);
		} else if (/\s/.test(ch)) {
			i++;
		} else {
			let out = '';
			while (i < len && !/[\s()]/.test(text[i])) out += text[i++];
			stack[stack.length - 1].push(out);
		}
	}
	return stack[0];
}

export function isList(node: SNode | undefined): node is SNode[] {
	return Array.isArray(node);
}

/** Direct children of `node` whose head symbol is `key`. */
export function children(node: SNode[], key: string): SNode[][] {
	return node.filter((c): c is SNode[] => isList(c) && c[0] === key);
}

export function child(node: SNode[], key: string): SNode[] | undefined {
	return children(node, key)[0];
}

/** First value of the `(key value)` child, as a string. */
export function prop(node: SNode[], key: string): string | undefined {
	const found = child(node, key);
	const value = found?.[1];
	return typeof value === 'string' ? value : undefined;
}

/** Every descendant list whose head symbol is `key`, at any depth. */
export function descendants(node: SNode[], key: string): SNode[][] {
	const out: SNode[][] = [];
	const walk = (current: SNode[]) => {
		for (const entry of current) {
			if (!isList(entry)) continue;
			if (entry[0] === key) out.push(entry);
			walk(entry);
		}
	};
	walk(node);
	return out;
}

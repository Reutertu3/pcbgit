/** iBOM theming: only well-formed hex colours reach the injected stylesheet. */
import assert from 'node:assert/strict';
import test from 'node:test';

const { IBOM_TOKENS, ibomThemeCss } = await import('../src/lib/ibomtheme.ts');

const valid = IBOM_TOKENS.map(() => '1f292d').join('-');

test('a full set of hex colours becomes a stylesheet', () => {
	const css = ibomThemeCss(valid, false);
	assert.match(css ?? '', /#topmostdiv \{/);
	assert.match(css ?? '', /--pad-color: #1f292d;/);
});

test('dark mode pre-inverts colours that iBOM inverts again', () => {
	const colors = IBOM_TOKENS.map((token) => (token === 'accent' ? '9cb080' : '000000')).join('-');
	assert.match(ibomThemeCss(colors, true) ?? '', /button\.depressed \{ background-color: #634f7f; \}/);
	assert.match(ibomThemeCss(colors, false) ?? '', /button\.depressed \{ background-color: #9cb080; \}/);
});

test('anything else is rejected, so nothing can be injected', () => {
	for (const bad of [
		null,
		'',
		valid.replace(/-[^-]+$/, ''), // one colour short
		`${valid}-000000`, // one too many
		valid.replace('1f292d', '1f292d;}body{x:y'),
		valid.replace('1f292d', 'fff'),
		valid.replace('1f292d', 'zzzzzz')
	]) {
		assert.equal(ibomThemeCss(bad, false), null, String(bad));
	}
});

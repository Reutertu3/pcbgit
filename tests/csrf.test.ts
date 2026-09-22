/** Cross-site protection: a form post must come from the address it was sent to. */
import assert from 'node:assert/strict';
import test from 'node:test';

const { isCrossSiteFormPost } = await import('../src/lib/server/csrf.ts');

/** A request as a browser would send it. */
function post(headers: Record<string, string>, method = 'POST') {
	return new Request('http://example.test/login', {
		method,
		headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
		body: method === 'GET' ? undefined : 'a=b'
	});
}

test('same-origin form posts pass, whatever the address', () => {
	for (const host of ['localhost:3000', '192.168.1.50:3000', 'pcbgit.lan:3000', 'pcbgit.com']) {
		const scheme = host === 'pcbgit.com' ? 'https' : 'http';
		assert.equal(isCrossSiteFormPost(post({ host, origin: `${scheme}://${host}` })), false, host);
	}
});

test('a post from another site is rejected', () => {
	assert.equal(isCrossSiteFormPost(post({ host: 'pcbgit.com', origin: 'https://evil.example' })), true);
	// A look-alike prefix is a different host.
	assert.equal(isCrossSiteFormPost(post({ host: 'pcbgit.com', origin: 'https://pcbgit.com.evil.example' })), true);
	// Another port on the same machine is another origin.
	assert.equal(isCrossSiteFormPost(post({ host: '192.168.1.50:3000', origin: 'http://192.168.1.50:9000' })), true);
});

test('missing or unusable headers are rejected', () => {
	assert.equal(isCrossSiteFormPost(post({ host: 'pcbgit.com' })), true, 'no Origin');
	assert.equal(isCrossSiteFormPost(post({ origin: 'https://pcbgit.com' })), true, 'no Host');
	assert.equal(isCrossSiteFormPost(post({ host: 'pcbgit.com', origin: 'not a url' })), true);
});

test('only form content types on unsafe methods are checked', () => {
	// git speaks its own content types and sends no Origin; it must pass.
	assert.equal(
		isCrossSiteFormPost(
			new Request('http://example.test/git/a/b.git/git-receive-pack', {
				method: 'POST',
				headers: { host: 'example.test', 'content-type': 'application/x-git-receive-pack-request' },
				body: 'x'
			})
		),
		false
	);
	// JSON from our own pages travels with fetch, which cannot be sent cross-site without CORS.
	assert.equal(isCrossSiteFormPost(post({ host: 'h', 'content-type': 'application/json' })), false);
	assert.equal(isCrossSiteFormPost(post({ host: 'h', origin: 'https://evil.example' }, 'GET')), false);
});

test('every form content type is covered', () => {
	for (const type of ['application/x-www-form-urlencoded', 'multipart/form-data; boundary=x', 'text/plain;charset=utf-8', 'TEXT/PLAIN']) {
		assert.equal(isCrossSiteFormPost(post({ host: 'h', origin: 'https://evil.example', 'content-type': type })), true, type);
	}
});

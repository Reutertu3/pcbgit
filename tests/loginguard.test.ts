import assert from 'node:assert/strict';
import test from 'node:test';

import { clearLoginFailures, loginRetryAfter, recordLoginFailure, safeNextPath } from '../src/lib/server/loginguard.ts';

test('only same-site paths survive as a post-login target', () => {
	assert.equal(safeNextPath('/settings'), '/settings');
	assert.equal(safeNextPath('/alice/board?v=abc'), '/alice/board?v=abc');
	for (const bad of ['//evil.example/x', '/\\evil.example', 'https://evil.example', 'evil', '', null, undefined]) {
		assert.equal(safeNextPath(bad), '/', String(bad));
	}
});

test('failed sign-ins are limited per address and per account', () => {
	const start = 1_000_000_000;
	// Ten failures from one address against different accounts block that address.
	for (let i = 0; i < 10; i++) recordLoginFailure('10.0.0.1', `user-${i}`, start + i);
	assert.ok(loginRetryAfter('10.0.0.1', 'someone-else', start + 10) > 0);
	assert.equal(loginRetryAfter('10.0.0.2', 'someone-else', start + 10), 0);
	// The block lifts once the oldest failure leaves the 15-minute window.
	assert.equal(loginRetryAfter('10.0.0.1', 'someone-else', start + 15 * 60 * 1000 + 1), 0);

	// Twenty failures against one account from many addresses block that account.
	for (let i = 0; i < 20; i++) recordLoginFailure(`10.1.0.${i}`, 'victim', start + i);
	assert.ok(loginRetryAfter('10.2.0.1', 'victim', start + 20) > 0);
	clearLoginFailures('victim');
	assert.equal(loginRetryAfter('10.2.0.1', 'victim', start + 20), 0);
});

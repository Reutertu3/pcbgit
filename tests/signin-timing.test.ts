/** Signing in as nobody must cost what a wrong password costs, or timing reveals who has an account. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pcbgit-signin-'));
process.env.PCBGIT_DATA_DIR = dataDir;
after(() => fs.rmSync(dataDir, { recursive: true, force: true }));

const { hashPassword, verifyNoAccount, verifyPassword } = await import('../src/lib/server/auth.ts');

/** Median of a few runs, so one slow scheduler tick does not decide. */
async function median(run: () => Promise<unknown>) {
	const times: number[] = [];
	for (let i = 0; i < 5; i++) {
		const start = performance.now();
		await run();
		times.push(performance.now() - start);
	}
	return times.sort((a, b) => a - b)[2];
}

test('no account costs about as much as a wrong password, and never succeeds', async () => {
	const stored = hashPassword('correct horse');
	assert.equal(await verifyNoAccount('correct horse'), false);
	const wrong = await median(() => verifyPassword('guess', stored));
	const nobody = await median(() => verifyNoAccount('guess'));
	// Lenient: only an answer without any scrypt work (well under a millisecond) fails.
	assert.ok(nobody > wrong * 0.5, `no account took ${nobody.toFixed(1)} ms, a wrong password ${wrong.toFixed(1)} ms`);
});

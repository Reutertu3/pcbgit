/**
 * A snapshot from the command line, without rendered output. deploy/update.sh runs
 * it in the still-running old version right before switching to a new one:
 * migrations run once at boot and cannot be undone, so this is the way back if a
 * new version damages data (restored under Admin → Backups). Keeps the newest few
 * of one label and prints the new snapshot's name.
 *
 *   docker compose exec -T pcbgit node --import ./tests/resolve-hook.mjs scripts/snapshot.ts pre-update </dev/null
 */
import { createSnapshot, deleteBackupEntry, listSnapshots } from '../src/lib/server/backups.ts';

const KEEP = 3;
const label = process.argv[2] ?? 'manual';
if (!/^[a-z0-9-]{1,32}$/.test(label)) {
	console.error(`Label must be lower-case letters, digits and dashes: ${label}`);
	process.exit(1);
}

const name = await createSnapshot({ includeArtifacts: false, actorId: null, label });
// Newest first; only this label's older ones go.
const same = listSnapshots().snapshots.filter((snapshot) => snapshot.name.endsWith(`-${label}.tar.gz`) || snapshot.name.includes(`-${label}-`));
for (const old of same.slice(KEEP)) deleteBackupEntry(old.name, null);
console.log(name);

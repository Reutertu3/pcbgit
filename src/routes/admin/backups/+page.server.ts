import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { audit } from '$lib/server/db';
import { createSnapshot, deleteBackupEntry, listSnapshots, saveUploadedSnapshot, snapshotPath } from '$lib/server/backups';
import { DATA_DIR } from '$lib/server/paths';
import { SnapshotError, cancelPendingRestore, pendingRestore, stageSnapshot } from '$lib/server/restore';

/** Under Docker the restart policy brings the server back; elsewhere an admin restarts it. */
const AUTO_RESTART = process.env.PCBHUB_RESTART_ON_RESTORE === 'true';

function message(error: unknown) {
	return error instanceof SnapshotError ? error.message : `Unexpected error: ${(error as Error).message}`;
}

export const load: PageServerLoad = async () => ({
	...listSnapshots(),
	pending: pendingRestore(DATA_DIR),
	autoRestart: AUTO_RESTART
});

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const includeArtifacts = (await request.formData()).get('artifacts') === 'on';
		try {
			const name = await createSnapshot({ includeArtifacts, actorId: locals.user!.id });
			return { success: true, message: `Created ${name}.` };
		} catch (error) {
			return fail(500, { error: message(error) });
		}
	},

	upload: async ({ request, locals }) => {
		const file = (await request.formData()).get('snapshot');
		if (!(file instanceof File) || file.size === 0) return fail(400, { error: 'Choose a snapshot file to upload.' });
		try {
			const name = await saveUploadedSnapshot(file, locals.user!.id);
			return { success: true, message: `Uploaded and verified ${name}. Restore it from the list below.` };
		} catch (error) {
			return fail(400, { error: message(error) });
		}
	},

	restore: async ({ request, locals }) => {
		const form = await request.formData();
		const name = String(form.get('name') ?? '');
		if (form.get('confirm') !== 'RESTORE') return fail(400, { error: 'Type RESTORE to confirm.' });

		try {
			stageSnapshot(snapshotPath(name), DATA_DIR);
		} catch (error) {
			return fail(400, { error: message(error) });
		}
		audit(locals.user!.id, 'admin.snapshot_restore', name, AUTO_RESTART ? 'restarting' : 'pending restart');

		if (AUTO_RESTART) {
			// Let this response reach the browser before the process exits.
			setTimeout(() => process.exit(0), 750);
			return { success: true, restarting: true, message: `Restoring ${name}. The server is restarting — reload in a few seconds.` };
		}
		return { success: true, message: `${name} is staged. Restart the server to apply it.` };
	},

	cancel: async ({ locals }) => {
		cancelPendingRestore(DATA_DIR);
		audit(locals.user!.id, 'admin.snapshot_restore_cancel');
		return { success: true, message: 'Pending restore cancelled.' };
	},

	delete: async ({ request, locals }) => {
		try {
			deleteBackupEntry(String((await request.formData()).get('name') ?? ''), locals.user!.id);
			return { success: true, message: 'Deleted.' };
		} catch (error) {
			return fail(400, { error: message(error) });
		}
	}
};

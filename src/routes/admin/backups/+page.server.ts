import { fail } from '@sveltejs/kit';
import { translate, type Locale } from '$lib/i18n';
import type { Actions, PageServerLoad } from './$types';
import { audit } from '$lib/server/db';
import { createSnapshot, deleteBackupEntry, listSnapshots, saveUploadedSnapshot, snapshotPath } from '$lib/server/backups';
import { DATA_DIR } from '$lib/server/paths';
import { bodySizeLimit } from '$lib/server/upload';
import { SnapshotError, cancelPendingRestore, pendingRestore, stageSnapshot } from '$lib/server/restore';

/** Under Docker the restart policy brings the server back; elsewhere an admin restarts it. */
const AUTO_RESTART = process.env.PCBGIT_RESTART_ON_RESTORE === 'true';

function message(error: unknown, locale: Locale) {
	return error instanceof SnapshotError
		? error.in(locale)
		: translate(locale, 'backups.error.unexpected', { detail: (error as Error).message });
}

export const load: PageServerLoad = async () => ({
	...listSnapshots(),
	pending: pendingRestore(DATA_DIR),
	autoRestart: AUTO_RESTART,
	uploadLimit: bodySizeLimit()
});

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const includeArtifacts = (await request.formData()).get('artifacts') === 'on';
		try {
			const name = await createSnapshot({ includeArtifacts, actorId: locals.user!.id });
			return { success: true, message: translate(locals.locale, 'backups.created', { name }) };
		} catch (error) {
			return fail(500, { error: message(error, locals.locale) });
		}
	},

	upload: async ({ request, locals }) => {
		const file = (await request.formData()).get('snapshot');
		if (!(file instanceof File) || file.size === 0) return fail(400, { error: translate(locals.locale, 'backups.error.chooseFile') });
		try {
			const name = await saveUploadedSnapshot(file, locals.user!.id);
			return { success: true, message: translate(locals.locale, 'backups.uploaded', { name }) };
		} catch (error) {
			return fail(400, { error: message(error, locals.locale) });
		}
	},

	restore: async ({ request, locals }) => {
		const form = await request.formData();
		const name = String(form.get('name') ?? '');
		if (form.get('confirm') !== 'RESTORE') return fail(400, { error: translate(locals.locale, 'backups.error.confirm') });

		try {
			stageSnapshot(snapshotPath(name), DATA_DIR);
		} catch (error) {
			return fail(400, { error: message(error, locals.locale) });
		}
		audit(locals.user!.id, 'admin.snapshot_restore', name, AUTO_RESTART ? 'restarting' : 'pending restart');

		if (AUTO_RESTART) {
			// Let this response reach the browser before the process exits.
			setTimeout(() => process.exit(0), 750);
			return { success: true, restarting: true, message: translate(locals.locale, 'backups.restoring', { name }) };
		}
		return { success: true, message: translate(locals.locale, 'backups.staged', { name }) };
	},

	cancel: async ({ locals }) => {
		cancelPendingRestore(DATA_DIR);
		audit(locals.user!.id, 'admin.snapshot_restore_cancel');
		return { success: true, message: translate(locals.locale, 'backups.cancelled') };
	},

	delete: async ({ request, locals }) => {
		try {
			deleteBackupEntry(String((await request.formData()).get('name') ?? ''), locals.user!.id);
			return { success: true, message: translate(locals.locale, 'backups.deleted') };
		} catch (error) {
			return fail(400, { error: message(error, locals.locale) });
		}
	}
};

import { applyAction, deserialize } from '$app/forms';
import { invalidateAll } from '$app/navigation';
import type { ActionResult } from '@sveltejs/kit';
import { t } from '$lib/i18n/t';

/**
 * Posts a form to its action the way `use:enhance` does, but through
 * XMLHttpRequest: fetch cannot report how much of a large upload has been sent.
 * The result is applied as enhance applies it (a redirect is followed, a failure
 * fills `form`, a success reloads the page's data). A connection that breaks off,
 * the server's request size limit (BODY_SIZE_LIMIT, answered as an error before the
 * action runs) or any other error come back as a failure with a message, so the
 * form shows it instead of an error page.
 */
export async function submitWithProgress(
	form: HTMLFormElement,
	body: FormData,
	onProgress: (sent: number, total: number) => void
): Promise<ActionResult> {
	const result = await new Promise<ActionResult>((resolve) => {
		const request = new XMLHttpRequest();
		request.open('POST', form.action);
		request.setRequestHeader('accept', 'application/json');
		request.setRequestHeader('x-sveltekit-action', 'true');
		request.upload.onprogress = (event) => {
			if (event.lengthComputable) onProgress(event.loaded, event.total);
		};
		const failed = () => {
			const key = request.status === 413 ? 'upload.error.archiveTooLarge' : 'upload.error.failed';
			resolve({ type: 'failure', status: request.status, data: { error: t(key) } });
		};
		request.onload = () => {
			let answer: ActionResult;
			try {
				answer = deserialize(request.responseText);
			} catch {
				return failed();
			}
			if (answer.type === 'error') return failed();
			resolve(answer);
		};
		request.onerror = failed;
		request.send(body);
	});
	if (result.type === 'success') await invalidateAll();
	await applyAction(result);
	return result;
}

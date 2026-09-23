import type { SubmitFunction } from '@sveltejs/kit';

/**
 * For `use:enhance` on forms that edit existing values. SvelteKit resets a form
 * after a successful submit, and a reset empties every field whose value came from
 * `value={…}` or `checked={…}`: Svelte sets the live value, not the default a reset
 * returns to. Saving a board's tags would blank its name that way.
 * Forms that should clear after submit (passwords, "create …") keep plain enhance.
 */
export const keepValues: SubmitFunction = () => async ({ update }) => {
	await update({ reset: false });
};

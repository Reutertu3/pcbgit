import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
export default {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter({ out: 'build' }),
		// Our own check runs in hooks.server.ts: it compares a form post's Origin with the
		// Host it was sent to, so one instance can be reached at several addresses.
		csrf: { checkOrigin: false }
	}
};

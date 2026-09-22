import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	// node:sqlite is a Node builtin; Rollup needs telling so it stops warning.
	ssr: { external: ['node:sqlite'] },
	build: { rollupOptions: { external: [/^node:/] } },
	server: { fs: { allow: ['..'] } }
});

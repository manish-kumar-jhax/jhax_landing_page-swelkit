import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		// Single deployable Node app (replaces the separate FastAPI backend).
		adapter: adapter(),
		alias: {
			'@': 'src/lib'
		}
	}
};

export default config;

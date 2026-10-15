import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import child_process from 'child_process';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://svelte.dev/docs/kit/integrations
	// for more information about preprocessors
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter({
			pages: 'build',
			fallback: '404.html'
		}),
		paths: {
			base: process.argv.includes('dev') ? '' : process.env.BASE_PATH
		},
		version: {
			name: child_process.execSync('git rev-parse --short HEAD').toString().trim()
		},
		serviceWorker: {
			// Precache only what the shell shows itself. CI seeds the runtime data into static/,
			// and the service worker caches that from the network instead
			files: (file) =>
				/^(manifest\.json|favicon\.ico|images\/(logo\/|loader-logo\.svg))/.test(file),
			// Dev has no build output or 404.html shell to precache
			...(process.argv.includes('dev') ? { register: false } : {})
		}
	}
};

export default config;

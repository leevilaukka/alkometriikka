import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	esbuild: {
		drop: process.argv.includes('dev') ? [] : ['console']
	},
	server: {
		watch: { ignored: ['**/static/reviews/**', '**/build/**'] }
	},
	plugins: [tailwindcss(), sveltekit()]
});

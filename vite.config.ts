import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	esbuild: {
		drop: process.argv.includes('dev') ? [] : ["console"]
	},
	server: {
		allowedHosts: ["desktop-leevi"]
	},
	plugins: [tailwindcss(), sveltekit()]
});

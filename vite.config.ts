import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { paraglideVitePlugin } from '@inlang/paraglide-js';

export default defineConfig({
	esbuild: {
		drop: process.argv.includes('dev') ? [] : ['console']
	},
	server: {},
	// Options live in project.inlang/paraglide.config.js
	plugins: [paraglideVitePlugin({ project: './project.inlang' }), tailwindcss(), sveltekit()]
});

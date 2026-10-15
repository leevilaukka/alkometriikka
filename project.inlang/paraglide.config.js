import { defineConfig } from '@inlang/paraglide-js';

// Shared by the Vite plugin (vite.config.ts) and `bun run i18n` (CLI compile for tests and checks).
export default defineConfig({
	outdir: './src/lib/paraglide',
	// The language lives only in the browser: URLs and prerendered pages stay Finnish, so
	// crawlers always see Finnish. Visitors pick another language in the settings.
	strategy: ['localStorage', 'baseLocale'],
	localStorageKey: 'locale',
	// The Vite plugin defaults to "locale-modules" in dev and the CLI to "message-modules". Both
	// write src/lib/paraglide, so a dev server and `bun run i18n` would leave a mix of the two
	outputStructure: 'message-modules',
	emitReadme: false
});

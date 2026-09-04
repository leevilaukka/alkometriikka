import { plugin } from 'bun';

// Minimal DOM/browser globals needed by app modules at import time.
// Register before any app module is imported.
const store = new Map<string, string>();
(globalThis as any).localStorage = {
	getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
	setItem: (k: string, v: string) => void store.set(k, String(v)),
	removeItem: (k: string) => void store.delete(k),
	clear: () => store.clear(),
	key: (i: number) => [...store.keys()][i] ?? null,
	get length() {
		return store.size;
	}
};
(globalThis as any).location = new URL('http://localhost/');
(globalThis as any).window = globalThis;
(globalThis as any).navigator = (globalThis as any).navigator || { userAgent: 'bun-test' };
(globalThis as any).matchMedia = () => ({
	matches: false,
	addEventListener: () => {},
	removeEventListener: () => {}
});
(globalThis as any).$state = (v: unknown) => v;

plugin({
	name: 'sveltekit-stubs',
	setup(build) {
		build.module('$app/environment', () => ({
			contents: 'export const dev = true; export const browser = true;'
		}));
		build.module('$app/navigation', () => ({
			contents:
				'export const replaceState = () => {}; export const pushState = () => {}; export const goto = async () => {};'
		}));
	}
});

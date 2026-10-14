/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { base, build, files, version } from '$service-worker';
// Relative, since SvelteKit's tsconfig (and its $lib alias) leaves the service worker out
import { CACHED_RESPONSE_HEADER } from './lib/utils/offline';

const sw = self as unknown as ServiceWorkerGlobalScope;

/** Code and the page shell of one deploy; replaced when a new version activates */
const APP_CACHE = `app-${version}`;
/** Last good copy of the runtime JSON (price list, stores, Daily), kept across deploys */
const DATA_CACHE = 'data';
/** How long fresh data may take to download before the stored copy is shown instead */
const DATA_TIMEOUT_MS = 5000;
/** How long a page may take to download before the shell is shown instead, so a weak signal doesn't hold up launch */
const NAVIGATE_TIMEOUT_MS = 3000;

/**
 * The SPA shell. Every route boots from it, and it references `_app` with absolute paths,
 * so it can stand in for any page while offline.
 */
const SHELL = `${base}/404.html`;

/** Name of a hashed asset without the hash and extension, e.g. `icons` for `icons.Cn171mNl.woff2` */
const assetName = (path: string) => path.slice(path.lastIndexOf('/') + 1).split('.')[0];

// Browsers that load the icon font take the woff2, so its woff and ttf fallbacks aren't precached
const woff2Fonts = new Set(build.filter((file) => file.endsWith('.woff2')).map(assetName));
const PRECACHE = [
	...build.filter((file) => !(/\.(woff|ttf)$/.test(file) && woff2Fonts.has(assetName(file)))),
	...files
];

sw.addEventListener('install', (event) => {
	event.waitUntil(
		(async () => {
			const cache = await caches.open(APP_CACHE);
			await cache.addAll(PRECACHE);
			// Bypass the HTTP cache so the shell matches the `_app` files of this deploy. Some
			// servers (vite preview) send it with a 404 status; it's stored as 200 either way
			const shell = await fetch(SHELL, { cache: 'reload' });
			if (!shell.ok && shell.status !== 404) throw new Error(`Shell failed: ${shell.status}`);
			await cache.put(SHELL, new Response(shell.body, { headers: shell.headers }));
			await sw.skipWaiting();
		})()
	);
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			for (const key of await caches.keys()) {
				if (key !== APP_CACHE && key !== DATA_CACHE) await caches.delete(key);
			}
			// Starts the page download while the worker boots, instead of after
			await sw.registration.navigationPreload?.enable();
			await sw.clients.claim();
		})()
	);
});

/** Stores a response, keeping the worker alive until it's written even though it has already responded */
function store(event: FetchEvent, response: Response) {
	if (response.ok) {
		const copy = response.clone();
		event.waitUntil(caches.open(APP_CACHE).then((cache) => cache.put(event.request, copy)));
	}
	return response;
}

function markCached(response: Response) {
	const headers = new Headers(response.headers);
	headers.set(CACHED_RESPONSE_HEADER, 'true');
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers
	});
}

/**
 * Network first, but when a stored copy exists, waits at most {@link DATA_TIMEOUT_MS} for the
 * download before showing that instead. The download carries on in the background, so the next
 * load gets fresh data.
 */
async function networkFirst(event: FetchEvent) {
	const cache = await caches.open(DATA_CACHE);
	const cached = await cache.match(event.request);
	// Settles once the whole body is stored, so a slow download counts against the timeout too.
	// Storing fails when the connection drops mid-download, and the body is then broken, so that
	// counts as a failed download. A full disk doesn't: the fresh copy is still fine to use
	const fresh = fetch(event.request).then(async (response) => {
		if (response.ok) {
			await cache.put(event.request, response.clone()).catch((error) => {
				if (!(error instanceof DOMException && error.name === 'QuotaExceededError')) throw error;
			});
		}
		return response;
	});
	if (!cached) return fresh;

	event.waitUntil(fresh.catch(() => {}));
	const timeout = new Promise<undefined>((resolve) => setTimeout(resolve, DATA_TIMEOUT_MS));
	const response = await Promise.race([fresh, timeout]).catch(() => undefined);
	return response ?? markCached(cached);
}

async function cacheFirst(event: FetchEvent) {
	const cached = await caches.match(event.request, { cacheName: APP_CACHE });
	return cached ?? store(event, await fetch(event.request));
}

async function navigate(event: FetchEvent) {
	const page = Promise.resolve(event.preloadResponse).then(
		(preloaded: Response | undefined) => preloaded ?? fetch(event.request)
	);
	const shell = await caches.match(SHELL, { cacheName: APP_CACHE });
	if (!shell) return page;

	page.catch(() => {});
	const timeout = new Promise<undefined>((resolve) => setTimeout(resolve, NAVIGATE_TIMEOUT_MS));
	const response = await Promise.race([page, timeout]).catch(() => undefined);
	return response ?? shell;
}

sw.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;

	const url = new URL(request.url);
	if (url.origin !== sw.location.origin) return;

	if (request.mode === 'navigate') {
		// Pages come from the network so stubs and redirects stay current; offline or slow, the
		// shell boots the SPA and routes client-side
		event.respondWith(navigate(event));
	} else if (url.pathname.startsWith(`${base}/_app/immutable/`)) {
		// Hashed, so a cached copy is never stale. Covers files skipped by the precache
		event.respondWith(cacheFirst(event));
	} else if (PRECACHE.includes(url.pathname)) {
		event.respondWith(cacheFirst(event));
	} else if (url.pathname.endsWith('.json') && !url.pathname.startsWith(`${base}/_app/`)) {
		// data.json, availability.json, notices.json and the Daily files: try for fresh data,
		// and fall back to the last copy that loaded when offline or slow
		event.respondWith(networkFirst(event));
	}
});

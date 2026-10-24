import { resolve } from '$app/paths';
import { parseDataset, parseRemovedProducts } from '$lib/utils/catalog/dataset';
import { REMOVED_DATASET_FILE } from '$lib/utils/catalog/datasetFile';
import { parseAvailability } from '$lib/utils/catalog/availability';
import type { AvailabilityData, DatasetRow } from '$lib/types';
import { Kaljakori } from '$lib/alko';
import { EMPTY_AVAILABILITY, LazyAvailability } from '$lib/alko/availability.svelte';
import { personalInfo } from '$lib/global.svelte';
import { dev } from '$app/env';
import { isCachedResponse } from '$lib/utils/app/offline';
import { STUB_DATA_ID } from '$lib/utils/app/seo';

export const ssr = false;
export const prerender = false;
// Stubs are `<path>/index.html` files that GitHub Pages serves at `<path>/`, and their
// canonicals and the sitemap use that URL, so the router must not strip the slash on load
export const trailingSlash = 'always';

function getDatasetURL() {
	return resolve('/') + 'data.json';
}

function getAvailabilityURL() {
	return resolve('/') + 'availability.json';
}

function getRemovedURL() {
	return resolve('/') + REMOVED_DATASET_FILE;
}

if (dev) localStorage.setItem('umami.disabled', '1');

type Fetch = (input: RequestInfo | URL, init?: RequestInit | undefined) => Promise<Response>;

async function fetchAlkoPriceList({ fetch }: { fetch: Fetch }) {
	// A page with a preview from its stub renders without the price list, so its own code and
	// photo go first on a slow connection; every other page waits for the list
	const hasPreview = document.getElementById(STUB_DATA_ID) !== null;
	const req = await fetch(getDatasetURL(), { priority: hasPreview ? 'low' : 'auto' });
	if (!req.ok) {
		throw new Error(`Hinnaston lataaminen epäonnistui: ${req.status} ${req.statusText}`);
	}
	const text = await req.text();
	return { text, cached: isCachedResponse(req) };
}

async function getDataset({ fetch }: { fetch: Fetch }) {
	const { text, cached } = await fetchAlkoPriceList({ fetch });
	return { dataset: parseDataset(text), cached };
}

/** Null when the file can't be loaded */
async function readAvailability(request: Promise<Response>): Promise<AvailabilityData | null> {
	try {
		const req = await request;
		if (!req.ok) {
			throw new Error(`Saatavuustietojen lataaminen epäonnistui: ${req.status} ${req.statusText}`);
		}
		return parseAvailability(await req.json());
	} catch (error) {
		console.warn(error);
		return null;
	}
}

/** Null when the file can't be loaded or doesn't fit the price list */
async function readRemoved(
	request: Promise<Response>,
	schema: unknown
): Promise<DatasetRow[] | null> {
	try {
		const req = await request;
		if (!req.ok) {
			throw new Error(
				`Poistuneiden tuotteiden lataaminen epäonnistui: ${req.status} ${req.statusText}`
			);
		}
		const rows = parseRemovedProducts(await req.text(), schema);
		if (!rows) throw new Error('Poistuneet tuotteet ovat väärässä muodossa');
		return rows;
	} catch (error) {
		console.warn(error);
		return null;
	}
}

/**
 * Lets the browser handle input and paint before the next step, so loading the price list
 * runs as several short tasks rather than one that freezes the page for seconds on a phone
 */
function yieldToMain() {
	const scheduler = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
	if (scheduler?.yield) return scheduler.yield();
	return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

/** Resolves once the first render is done and the main thread is free. */
function whenIdle() {
	return new Promise<void>((resolve) => {
		if ('requestIdleCallback' in window) requestIdleCallback(() => resolve(), { timeout: 3000 });
		else setTimeout(resolve, 500);
	});
}

async function getData({ fetch }: { fetch: Fetch }) {
	// Both files download in parallel, but only the price list blocks rendering.
	// Store availability is needed for store filters and store pages, so it is
	// parsed once the first render is done and filled in when ready.
	const availabilityRequest = fetch(getAvailabilityURL(), { priority: 'low' });
	availabilityRequest.catch(() => {}); // handled in readAvailability

	const { dataset, cached } = await getDataset({ fetch });
	await yieldToMain();
	const kaljakori = new Kaljakori(dataset.table, personalInfo, undefined, dataset.index);
	// Only these are needed from here on; nothing below may refer to `dataset`, so its table of
	// raw rows, several megabytes once the products are built from it, can be freed
	const { schema, metadata, removedProducts } = dataset;
	// Products removed from the selection are in their own file, fetched once the price list is
	// in so they don't slow it down, and added once the first render is done. Pages showing
	// them re-render then; ones that can't do without them await `removedReady`
	const removedReady = removedProducts
		? (async () => {
				const request = fetch(getRemovedURL(), { priority: 'low' });
				request.catch(() => {}); // handled in readRemoved
				await whenIdle();
				const rows = await readRemoved(request, schema);
				if (rows) kaljakori.addProducts(rows);
			})()
		: Promise.resolve();
	// Then, still while idle, gets the names ready for search so the first keystroke is quick
	removedReady.then(whenIdle).then(() => kaljakori.prepareSearch());
	// Pages re-render with the whole list once this resolves
	await yieldToMain();
	const availability = new LazyAvailability(async () => {
		await whenIdle();
		const data = await readAvailability(availabilityRequest);
		// Without store data the app carries on with none, and pages that show it say it failed
		kaljakori.setAvailability(data ?? EMPTY_AVAILABILITY);
		return data;
	});

	return {
		dataset: { metadata },
		kaljakori,
		/** The service worker's stored copy of data.json, served while offline or on a slow connection */
		cached,
		/** Empty until availability.json has loaded; reactive in templates and deriveds. */
		get availability() {
			return availability.current;
		},
		get availabilityLoaded() {
			return availability.loaded;
		},
		/** availability.json couldn't be loaded, so the empty store data isn't real */
		get availabilityFailed() {
			return availability.failed;
		},
		/** For code that can't render without store data. */
		availabilityReady: availability.ready,
		/** Resolves once removed products are in the price list, or failed to load. Never rejects. */
		removedReady
	};
}

export async function load({ fetch }: { fetch: Fetch }) {
	const alko = getData({ fetch });
	// The same data, resolved only once store availability has loaded too, for
	// pages that can't be shown without it
	const alkoWithStores = alko.then(async (data) => {
		await data.availabilityReady;
		return data;
	});
	alkoWithStores.catch(() => {}); // errors are shown through `alko`
	// And once the products removed from the selection have loaded, for pages that show saved
	// products, which may be removed ones
	const alkoWithRemoved = alko.then(async (data) => {
		await data.removedReady;
		return data;
	});
	alkoWithRemoved.catch(() => {});
	return { alko, alkoWithStores, alkoWithRemoved };
}

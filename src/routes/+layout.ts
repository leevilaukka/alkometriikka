import { resolve } from '$app/paths';
import { parseDataset } from '$lib/utils/catalog/dataset';
import { parseAvailability } from '$lib/utils/catalog/availability';
import type { AvailabilityData } from '$lib/types';
import { Kaljakori } from '$lib/alko';
import { EMPTY_AVAILABILITY, LazyAvailability } from '$lib/alko/availability.svelte';
import { personalInfo } from '$lib/global.svelte';
import { dev } from '$app/env';
import { isCachedResponse } from '$lib/utils/app/offline';

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

if (dev) localStorage.setItem('umami.disabled', '1');

type Fetch = (input: RequestInfo | URL, init?: RequestInit | undefined) => Promise<Response>;

async function fetchAlkoPriceList({ fetch }: { fetch: Fetch }) {
	const req = await fetch(getDatasetURL());
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
	const availabilityRequest = fetch(getAvailabilityURL());
	availabilityRequest.catch(() => {}); // handled in readAvailability

	const { dataset, cached } = await getDataset({ fetch });
	const kaljakori = new Kaljakori(dataset.table, personalInfo, undefined, dataset.index);
	const availability = new LazyAvailability(async () => {
		await whenIdle();
		const data = await readAvailability(availabilityRequest);
		// Without store data the app carries on with none, and pages that show it say it failed
		kaljakori.setAvailability(data ?? EMPTY_AVAILABILITY);
		return data;
	});

	return {
		dataset,
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
		availabilityReady: availability.ready
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
	return { alko, alkoWithStores };
}

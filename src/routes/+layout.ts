import { resolve } from '$app/paths';
import { parseDataset } from '$lib/utils/dataset';
import { parseAvailability } from '$lib/utils/availability';
import type { AvailabilityData } from '$lib/types';
import { Kaljakori } from '$lib/alko';
import { LazyAvailability } from '$lib/alko/availability.svelte';
import { personalInfo } from '$lib/global.svelte';
import { dev } from '$app/env';

export const ssr = false;
export const prerender = false;

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
	return text;
}

async function getDataset({ fetch }: { fetch: Fetch }) {
	const data = await fetchAlkoPriceList({ fetch });
	const json = parseDataset(data);
	return json;
}

async function readAvailability(request: Promise<Response>): Promise<AvailabilityData> {
	try {
		const req = await request;
		if (!req.ok) {
			throw new Error(`Saatavuustietojen lataaminen epäonnistui: ${req.status} ${req.statusText}`);
		}
		return parseAvailability(await req.json());
	} catch (error) {
		console.warn(error);
		return { stores: {}, product: {} };
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

	const dataset = await getDataset({ fetch });
	const kaljakori = new Kaljakori(dataset.table, personalInfo, undefined, dataset.index);
	const availability = new LazyAvailability(async () => {
		await whenIdle();
		const data = await readAvailability(availabilityRequest);
		kaljakori.setAvailability(data);
		return data;
	});

	return {
		dataset,
		kaljakori,
		/** Empty until availability.json has loaded; reactive in templates and deriveds. */
		get availability() {
			return availability.current;
		},
		get availabilityLoaded() {
			return availability.loaded;
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

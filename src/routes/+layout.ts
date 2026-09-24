import { resolve } from '$app/paths';
import type { AvailabilityData } from '$lib/types';
import { Kaljakori } from '$lib/alko';
import { formatDatasetToJSON, parseAvailability } from '$lib/alko/dataset';
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

async function fetchAvailability({ fetch }: { fetch: Fetch }): Promise<AvailabilityData> {
	const req = await fetch(getAvailabilityURL());
	if (!req.ok) {
		throw new Error(`Saatavuustietojen lataaminen epäonnistui: ${req.status} ${req.statusText}`);
	}

	return parseAvailability(await req.json());
}

async function getDataset({ fetch }: { fetch: Fetch }) {
	const data = await fetchAlkoPriceList({ fetch });
	const json = formatDatasetToJSON(data);
	return json;
}

async function getAvailability({ fetch }: { fetch: Fetch }): Promise<AvailabilityData> {
	try {
		return await fetchAvailability({ fetch });
	} catch (error) {
		console.warn(error);
		return { stores: {}, product: {} };
	}
}

async function getData({ fetch }: { fetch: Fetch }) {
	return new Promise<{
		dataset: { table: any[]; metadata: Record<string, unknown> };
		availability: AvailabilityData;
		kaljakori: Kaljakori;
	}>(async (resolve, reject) => {
		try {
			const [dataset, availability] = await Promise.all([
				getDataset({ fetch }),
				getAvailability({ fetch })
			]);
			resolve({
				dataset,
				availability,
				kaljakori: new Kaljakori(dataset.table, personalInfo, availability)
			});
		} catch (error) {
			reject(error);
		}
	});
}

export async function load({ fetch }: { fetch: Fetch }) {
	return { alko: getData({ fetch }) };
}

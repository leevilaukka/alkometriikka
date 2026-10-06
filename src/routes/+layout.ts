import { resolve } from '$app/paths';
import { parseDataset } from '$lib/utils/dataset';
import type { AvailabilityData, AvailabilityStore } from '$lib/types';
import { Kaljakori } from '$lib/alko';
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

	const data = (await req.json()) as Partial<AvailabilityData>;
	if (!data || typeof data !== 'object' || !data.stores || !data.product) {
		throw new Error('Saatavuustiedot ovat tyhjät tai väärässä muodossa');
	}

	const stores = Object.fromEntries(
		Object.entries(data.stores).filter(
			(entry): entry is [string, AvailabilityStore] =>
				!!entry[1] &&
				typeof entry[1] === 'object' &&
				typeof entry[1].id === 'string' &&
				typeof entry[1].name === 'string' &&
				entry[1].outletType !== '2'
		)
	);
	const product = Object.fromEntries(
		Object.entries(data.product).filter(
			(entry): entry is [string, string[]] =>
				Array.isArray(entry[1]) && entry[1].every((storeId) => typeof storeId === 'string')
		)
	);

	return { lastUpdated: data.lastUpdated, stores, product };
}

async function getDataset({ fetch }: { fetch: Fetch }) {
	const data = await fetchAlkoPriceList({ fetch });
	const json = parseDataset(data);
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

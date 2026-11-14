import { afterEach, describe, expect, it } from 'bun:test';
import { LEGACY_HEADERS } from '../../scripts/data/constants';
import { carryOwnColumns } from '../../scripts/data/lifecycle';
import { applyScannedEans, cleanEans, loadScannedEans } from '../../scripts/data/scanned-eans';
import type { MigratedProduct } from '../../scripts/data/types';

const EAN = LEGACY_HEADERS.indexOf('EAN');
const NAME = LEGACY_HEADERS.indexOf('Nimi');

function product(id: string, ean: string | null = null): MigratedProduct {
	const values: unknown[] = Array(LEGACY_HEADERS.length).fill(null);
	values[LEGACY_HEADERS.indexOf('Numero')] = id;
	values[NAME] = `Tuote ${id}`;
	values[EAN] = ean;
	return { hash: id, values, priceHistory: [] };
}

describe('carryOwnColumns', () => {
	it('keeps the stored EAN when the API rebuild has none', () => {
		const built = product('200047').values;
		const carried = carryOwnColumns(built, product('200047', '5011007017965').values);
		expect(carried[EAN]).toBe('5011007017965');
		expect(built[EAN]).toBeNull();
	});

	it('returns the built values themselves when there is nothing to carry', () => {
		const built = product('200047').values;
		expect(carryOwnColumns(built, product('200047').values)).toBe(built);
		expect(carryOwnColumns(built, undefined)).toBe(built);
	});

	it('only carries own columns, never API ones', () => {
		const previous = product('200047', '5011007017965').values;
		previous[NAME] = 'Vanha nimi';
		const built = product('200047').values;
		built[NAME] = null;
		expect(carryOwnColumns(built, previous)[NAME]).toBeNull();
	});
});

describe('applyScannedEans', () => {
	it('writes a scanned barcode into its product', () => {
		const products = { '200047': product('200047') };
		const updated = applyScannedEans(products, [
			{ ean: '5011007017965', id: '200047', seenAt: '2026-11-05T22:00:00.000Z' }
		]);
		expect(updated).toEqual(['200047']);
		expect(products['200047'].values[EAN]).toBe('5011007017965');
	});

	it('replaces a different stored EAN with the scanned one', () => {
		const products = { '300014': product('300014', '6412700709703') };
		const updated = applyScannedEans(products, [
			{ ean: '6412700709710', id: '300014', seenAt: '2026-11-05T22:00:00.000Z' }
		]);
		expect(updated).toEqual(['300014']);
		expect(products['300014'].values[EAN]).toBe('6412700709710');
	});

	it('does not touch a product whose EAN already matches', () => {
		const products = { '300014': product('300014', '6412700709710') };
		const before = products['300014'];
		const updated = applyScannedEans(products, [
			{ ean: '6412700709710', id: '300014', seenAt: '2026-11-05T22:00:00.000Z' }
		]);
		expect(updated).toEqual([]);
		expect(products['300014']).toBe(before);
	});

	it('picks the first barcode seen when a product has several', () => {
		const products = { '200047': product('200047') };
		applyScannedEans(products, [
			{ ean: '5011007017972', id: '200047', seenAt: '2026-11-06T10:00:00.000Z' },
			{ ean: '5011007017965', id: '200047', seenAt: '2026-11-05T22:00:00.000Z' }
		]);
		expect(products['200047'].values[EAN]).toBe('5011007017965');
	});

	it('skips barcodes of products not in the dataset', () => {
		const products = { '200047': product('200047') };
		expect(
			applyScannedEans(products, [
				{ ean: '4067700017802', id: '999999', seenAt: '2026-11-05T22:00:00.000Z' }
			])
		).toEqual([]);
		expect(Object.keys(products)).toEqual(['200047']);
	});
});

describe('cleanEans', () => {
	it('empties values that are not a valid GTIN', () => {
		const odd = product('100033');
		odd.values[EAN] = [{ date: '2026-01-26', price: '27.66' }];
		const products = {
			'100033': odd,
			'200047': product('200047', '5011007017965'),
			'300010': product('300010', '5011007017966'),
			'423057': product('423057', '0000000000000')
		};
		expect(cleanEans(products).sort()).toEqual(['100033', '300010', '423057']);
		expect(products['100033'].values[EAN]).toBeNull();
		expect(products['200047'].values[EAN]).toBe('5011007017965');
	});

	it('empties a barcode shared by several products', () => {
		const products = {
			'300010': product('300010', '6412700288161'),
			'948211': product('948211', '6412700288161'),
			'200047': product('200047', '5011007017965')
		};
		expect(cleanEans(products).sort()).toEqual(['300010', '948211']);
		expect(products['300010'].values[EAN]).toBeNull();
		expect(products['200047'].values[EAN]).toBe('5011007017965');
	});

	it('lets a scanned barcode decide which sharing product keeps it', () => {
		const products = {
			'300010': product('300010', '6412700288161'),
			'948211': product('948211', '6412700288161')
		};
		const cleared = cleanEans(products, [
			{ ean: '6412700288161', id: '948211', seenAt: '2026-11-05T22:00:00.000Z' }
		]);
		expect(cleared).toEqual(['300010']);
		expect(products['948211'].values[EAN]).toBe('6412700288161');
	});
});

describe('cleanEans with removed products', () => {
	it('keeps the barcode on the lone active product', () => {
		const old = {
			...product('928201', '5011007017965'),
			meta: { removedFromSelection: '2026-07-14' }
		};
		const products = { '928201': old, '200047': product('200047', '5011007017965') };
		expect(cleanEans(products)).toEqual(['928201']);
		expect(products['200047'].values[EAN]).toBe('5011007017965');
		expect(products['928201'].values[EAN]).toBeNull();
	});
});

describe('loadScannedEans', () => {
	const realFetch = globalThis.fetch;
	const env = { ...process.env };
	afterEach(() => {
		globalThis.fetch = realFetch;
		process.env = { ...env };
	});

	it('is null when the export is not configured', async () => {
		delete process.env.GTIN_EXPORT_URL;
		delete process.env.GTIN_EXPORT_TOKEN;
		expect(await loadScannedEans()).toBeNull();
	});

	it('reads the entries with the token and drops malformed ones', async () => {
		process.env.GTIN_EXPORT_URL = 'https://api.alkometriikka.fi/gtin/export';
		process.env.GTIN_EXPORT_TOKEN = 'secret';
		let auth = null as string | null;
		globalThis.fetch = (async (_url: string, init: RequestInit) => {
			auth = new Headers(init.headers).get('Authorization');
			return Response.json({
				entries: [
					{ ean: '5011007017965', id: '200047', seenAt: '2026-11-05T22:00:00.000Z' },
					{ ean: 'nope', id: '1', seenAt: '' }
				]
			});
		}) as unknown as typeof fetch;
		expect(await loadScannedEans()).toEqual([
			{ ean: '5011007017965', id: '200047', seenAt: '2026-11-05T22:00:00.000Z' }
		]);
		expect(auth).toBe('Bearer secret');
	});

	it('is null when the export fails, so the sync carries on', async () => {
		process.env.GTIN_EXPORT_URL = 'https://api.alkometriikka.fi/gtin/export';
		process.env.GTIN_EXPORT_TOKEN = 'secret';
		globalThis.fetch = (async () => new Response('', { status: 401 })) as unknown as typeof fetch;
		expect(await loadScannedEans()).toBeNull();
	});
});

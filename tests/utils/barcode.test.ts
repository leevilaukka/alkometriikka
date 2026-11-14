import { beforeEach, describe, expect, it } from 'bun:test';
import type { PriceListItem } from '$lib/types';
import {
	clearBarcodeAnswers,
	findProductByBarcode,
	normalizeBarcode
} from '$lib/utils/catalog/barcode';
import { AllColumns } from '$lib/utils/constants/columns';

const JAMESON = '5011007017965';

function item(id: string, ean?: string, removed = false): PriceListItem {
	return {
		[AllColumns.Number]: id,
		[AllColumns.EAN]: ean,
		[AllColumns.RemovedFromSelection]: removed
	} as unknown as PriceListItem;
}

function catalog(items: PriceListItem[]) {
	return {
		data: items,
		findById: (id: string) => items.find((product) => product[AllColumns.Number] === id)
	};
}

function worker(status: number, body: unknown = {}) {
	const calls: string[] = [];
	const fetchFn = (async (url: string) => {
		calls.push(url);
		return new Response(JSON.stringify(body), { status });
	}) as unknown as typeof fetch;
	return { calls, fetchFn };
}

describe('normalizeBarcode', () => {
	it('pads a UPC-A code to EAN-13', () => {
		expect(normalizeBarcode('088352140261', 'upc_a')).toBe('0088352140261');
		expect(normalizeBarcode(JAMESON, 'ean_13')).toBe(JAMESON);
	});
});

describe('findProductByBarcode', () => {
	beforeEach(clearBarcodeAnswers);

	it('finds an active product by its stored EAN without asking the Worker', async () => {
		const { calls, fetchFn } = worker(500);
		const match = await findProductByBarcode(catalog([item('200047', JAMESON)]), JAMESON, fetchFn);
		expect(match.source).toBe('local');
		expect(match.product?.[AllColumns.Number]).toBe('200047');
		expect(calls).toEqual([]);
	});

	it('asks the Worker for an unknown barcode', async () => {
		const { calls, fetchFn } = worker(200, { id: '200047' });
		const match = await findProductByBarcode(catalog([item('200047')]), JAMESON, fetchFn);
		expect(match.source).toBe('worker');
		expect(match.product?.[AllColumns.Number]).toBe('200047');
		expect(calls).toEqual([`https://api.alkometriikka.fi/gtin/${JAMESON}`]);
	});

	it('prefers the current product over a removed one that had the barcode', async () => {
		const { fetchFn } = worker(200, { id: '200047' });
		const products = [item('928201', JAMESON, true), item('200047')];
		const match = await findProductByBarcode(catalog(products), JAMESON, fetchFn);
		expect(match.product?.[AllColumns.Number]).toBe('200047');
	});

	it('falls back to the removed product when the Worker has nothing better', async () => {
		const products = [item('928201', JAMESON, true)];
		for (const status of [404, 502]) {
			const match = await findProductByBarcode(catalog(products), JAMESON, worker(status).fetchFn);
			expect(match.source).toBe('local');
			expect(match.product?.[AllColumns.Number]).toBe('928201');
		}
	});

	it('tells a missing product from a failed lookup', async () => {
		const products = catalog([item('100001')]);
		expect((await findProductByBarcode(products, JAMESON, worker(404).fetchFn)).source).toBe(
			'not_found'
		);
		clearBarcodeAnswers();
		expect((await findProductByBarcode(products, JAMESON, worker(502).fetchFn)).source).toBe(
			'error'
		);
		// The Worker knows a product data.json doesn't have yet
		clearBarcodeAnswers();
		const unknown = worker(200, { id: '999999' });
		expect((await findProductByBarcode(products, JAMESON, unknown.fetchFn)).source).toBe(
			'not_found'
		);
	});

	it('rejects an invalid code without asking', async () => {
		const { calls, fetchFn } = worker(200, { id: '200047' });
		const match = await findProductByBarcode(catalog([]), '5011007017964', fetchFn);
		expect(match.source).toBe('not_found');
		expect(calls).toEqual([]);
	});

	it("remembers the Worker's answers but not its failures", async () => {
		const products = catalog([item('200047')]);
		const found = worker(200, { id: '200047' });
		await findProductByBarcode(products, JAMESON, found.fetchFn);
		await findProductByBarcode(products, JAMESON, found.fetchFn);
		expect(found.calls).toHaveLength(1);

		clearBarcodeAnswers();
		const missing = worker(404);
		await findProductByBarcode(products, JAMESON, missing.fetchFn);
		await findProductByBarcode(products, JAMESON, missing.fetchFn);
		expect(missing.calls).toHaveLength(1);

		clearBarcodeAnswers();
		const failing = worker(502);
		await findProductByBarcode(products, JAMESON, failing.fetchFn);
		await findProductByBarcode(products, JAMESON, failing.fetchFn);
		expect(failing.calls).toHaveLength(2);
	});
});

import { describe, expect, it, mock } from 'bun:test';
import { ToolInputError } from '../catalog.ts';
import { fixtureCatalog } from './helpers.ts';

// The site's list helpers import browser state; stub it so the real decoder can run here.
mock.module('$lib/global.svelte', () => ({ lists: [] }));
mock.module('../../src/lib/utils/helpers.ts', () => ({ getRandom: () => crypto.randomUUID() }));
const { URIToList, validateList, getListTimestamp } = await import('../../src/lib/utils/lists.ts');

const catalog = fixtureCatalog();
const listParam = (url: string) => new URL(url).searchParams.get('list')!;

describe('createListLink', () => {
	it('encodes a list the site can read, with quantities', () => {
		const result = catalog.createListLink('Juhannus', [
			{ product_id: '200002', quantity: 12 },
			{ product_id: '300003', quantity: 2 },
			{ product_id: '100001' }
		]);
		expect(result.url.startsWith('https://alkometriikka.fi/listat?list=')).toBe(true);

		const param = listParam(result.url);
		expect(validateList(param)).toBe(true);
		const list = URIToList(param);
		expect(list.name).toBe('Juhannus');
		expect(list.items).toEqual([
			{ id: '200002', q: 12 },
			{ id: '300003', q: 2 },
			{ id: '100001', q: 1 }
		]);
		expect(Math.abs(getListTimestamp(list)!.getTime() - Date.now())).toBeLessThan(10_000);
	});

	it('merges repeated products and accepts URLs and dropped leading zeros', () => {
		const result = catalog.createListLink(' Viinit ', [
			{ product_id: '8003', quantity: 2 },
			{ product_id: 'https://www.alko.fi/tuotteet/008003', quantity: 3 }
		]);
		expect(result.name).toBe('Viinit');
		expect(URIToList(listParam(result.url)).items).toEqual([{ id: '008003', q: 5 }]);
		expect(result.products).toHaveLength(1);
		expect(result.products[0]).toMatchObject({ id: '008003', quantity: 5 });
	});

	it('reports line and list totals', () => {
		const result = catalog.createListLink('Totals', [
			{ product_id: '300003', quantity: 2 },
			{ product_id: '100001', quantity: 1 }
		]);
		const [wine, vodka] = result.products;
		expect(wine!.line_total_eur).toBe(25.8);
		expect(vodka!.line_total_eur).toBe(20);
		expect(result.totals).toMatchObject({ items: 3, price_eur: 45.8, volume_l: 2 });
		const grams =
			catalog.getProduct('300003').product.metrics.alcohol_grams! * 2 +
			catalog.getProduct('100001').product.metrics.alcohol_grams!;
		expect(result.totals.alcohol_grams).toBeCloseTo(grams, 1);
		expect(result.totals.standard_drinks).toBeCloseTo(grams / 12, 1);
	});

	it('refuses to create a link with unknown products', () => {
		expect(() =>
			catalog.createListLink('X', [{ product_id: '200002' }, { product_id: '999999' }])
		).toThrow(/999999.*no link was created/);
	});

	it('rejects an empty name and too large merged quantities', () => {
		expect(() => catalog.createListLink('  ', [{ product_id: '200002' }])).toThrow(ToolInputError);
		expect(() =>
			catalog.createListLink('X', [
				{ product_id: '200002', quantity: 60 },
				{ product_id: '200002', quantity: 60 }
			])
		).toThrow(/maximum is 99/);
	});

	it('uses the configured site URL', () => {
		const { url } = fixtureCatalog({ siteUrl: 'https://example.test/' }).createListLink('X', [
			{ product_id: '200002' }
		]);
		expect(url.startsWith('https://example.test/listat?list=')).toBe(true);
	});
});

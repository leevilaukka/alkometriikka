import { describe, expect, it } from 'bun:test';
import { calculateDrunkValue } from '../../src/lib/utils/alko.ts';
import { AllColumns, DrunkColumns } from '../../src/lib/utils/constants.ts';
import { ToolInputError, parseProductId } from '../catalog.ts';
import { fixtureCatalog } from './helpers.ts';

const catalog = fixtureCatalog();
const ids = (result: { products: { id: string }[] }) => result.products.map((p) => p.id);

describe('search', () => {
	it('matches product names', () => {
		const result = catalog.search({ query: 'testilager' });
		expect(ids(result)).toEqual(['200002']);
		expect(result.sort_by).toBe('relevance');
		expect(result.applied_filters).toMatchObject({ query: 'testilager' });
	});

	it('excludes removed products unless asked', () => {
		expect(ids(catalog.search({ query: 'viski' }))).toEqual([]);
		expect(ids(catalog.search({ query: 'viski', include_removed: true }))).toEqual(['500005']);
		expect(catalog.search({ limit: 50 }).total_matches).toBe(5);
		expect(catalog.search({ limit: 50, include_removed: true }).total_matches).toBe(6);
	});

	it('returns an empty result with a hint when nothing matches', () => {
		const result = catalog.search({ query: 'zzqqxx' });
		expect(result.total_matches).toBe(0);
		expect(result.products).toEqual([]);
		expect(result.has_more).toBe(false);
		expect(result.hint).toContain('No products matched');
	});

	it('resolves categorical filters case-insensitively and partially', () => {
		const result = catalog.search({ category: ['viini'] });
		expect(result.applied_filters.category).toEqual(['Viinit']);
		expect(ids(result).sort()).toEqual(['008003', '300003']);

		expect(ids(catalog.search({ subcategory: ['OLUET'], style: ['lager'] }))).toEqual(['200002']);
		expect(ids(catalog.search({ country: ['ranska'], region: ['bordeaux'] }))).toEqual(['300003']);
	});

	it('tolerates Finnish inflection with a single close match', () => {
		const result = catalog.search({ subcategory: ['olut'] });
		expect(result.applied_filters.subcategory).toEqual(['Oluet']);
		expect(ids(result)).toEqual(['200002']);
	});

	it('rejects unknown filter values with suggestions', () => {
		expect(() => catalog.search({ country: ['Atlantis'] })).toThrow(ToolInputError);
		expect(() => catalog.search({ country: ['Atlantis'] })).toThrow(/list_filter_values/);
	});

	it('points out a value used on the wrong filter level', () => {
		expect(() => catalog.search({ category: ['Oluet'] })).toThrow(/subcategory filter/);
	});

	it('ignores legacy values that only removed products have', () => {
		expect(() => catalog.search({ category: ['Viskit'] })).toThrow(ToolInputError);
		expect(ids(catalog.search({ category: ['Viskit'], include_removed: true }))).toEqual([
			'500005'
		]);
	});

	it('requires all grapes (AND semantics, as on the website)', () => {
		expect(ids(catalog.search({ grapes: ['merlot'] }))).toEqual(['300003']);
		expect(ids(catalog.search({ grapes: ['Merlot', 'Pinot Grigio'] }))).toEqual([]);
	});

	it('filters by numeric ranges', () => {
		expect(ids(catalog.search({ max_price: 3, sort_by: 'price' }))).toEqual(['400004', '200002']);
		expect(ids(catalog.search({ min_alcohol_percentage: 13, sort_by: 'price' }))).toEqual([
			'300003',
			'100001'
		]);
		expect(ids(catalog.search({ min_bottle_size_l: 0.7, max_bottle_size_l: 0.75 })).sort()).toEqual(
			['008003', '300003']
		);
		expect(() => catalog.search({ min_price: 10, max_price: 5 })).toThrow(ToolInputError);
	});

	it('filters by sale status', () => {
		expect(ids(catalog.search({ on_sale: true }))).toEqual(['200002']);
		expect(ids(catalog.search({ on_sale: false, limit: 50 }))).not.toContain('200002');
	});

	it('filters by store id, store name or city', () => {
		expect(ids(catalog.search({ store: ['2301'] }))).toEqual(['300003']);
		expect(ids(catalog.search({ store: ['Turku Testi'] }))).toEqual(['300003']);
		const tampere = catalog.search({ store: ['tampere'], sort_by: 'name' });
		expect(tampere.applied_filters.store).toHaveLength(2);
		expect(ids(tampere)).toEqual(['300003', '200002', '100001']);
		expect(() => catalog.search({ store: ['Nowhere'] })).toThrow(ToolInputError);
	});

	it('sorts, with missing €/L alcohol values last', () => {
		const result = catalog.search({ sort_by: 'euro_per_liter_alcohol', limit: 50 });
		expect(ids(result).at(-1)).toBe('400004');
		const values = result.products.slice(0, -1).map((p) => p.euro_per_liter_alcohol!);
		expect(values).toEqual([...values].sort((a, b) => a - b));

		const byValue = catalog.search({ limit: 50 });
		expect(byValue.sort_by).toBe('alcohol_grams_per_euro');
		const grams = byValue.products.map((p) => p.alcohol_grams_per_euro!);
		expect(grams).toEqual([...grams].sort((a, b) => b - a));
	});

	it('pages results', () => {
		const first = catalog.search({ sort_by: 'name', limit: 2 });
		const second = catalog.search({ sort_by: 'name', limit: 2, offset: 2 });
		expect(first.has_more).toBe(true);
		expect(second.offset).toBe(2);
		expect(ids(first)).not.toContainAnyValues(ids(second));
	});
});

describe('getProduct', () => {
	it('returns product details and metadata', () => {
		const { product, dataset } = catalog.getProduct('300003');
		expect(product).toMatchObject({
			id: '300003',
			name: 'Château Testi 2022',
			category: 'Viinit',
			subcategory: 'Punaviinit',
			country: 'Ranska',
			region: 'Bordeaux',
			vintage: '2022',
			bottle_size_l: 0.75,
			price_eur: 12.9,
			price_per_liter_eur: 17.2,
			alcohol_percentage: 13.5,
			grapes: ['Merlot', 'Cabernet Sauvignon'],
			store_count: 2,
			url: 'https://alkometriikka.fi/tuotteet/300003/',
			alko_url: 'https://www.alko.fi/tuotteet/300003'
		});
		expect(dataset.last_updated).toBe('2026-09-20T10:00:00.000Z');
	});

	it('computes metrics with the existing Alkometriikka implementation', () => {
		for (const id of ['100001', '200002', '300003', '008003']) {
			const { product } = catalog.getProduct(id);
			const expected = calculateDrunkValue(
				product.bottle_size_l!,
				product.alcohol_percentage!,
				product.price_eur!
			);
			expect(product.metrics).toEqual({
				alcohol_grams: expected[DrunkColumns.AlcoholGrams],
				alcohol_grams_per_euro: expected[DrunkColumns.AlcoholGramsPerEuro],
				euro_per_liter_alcohol: expected[DrunkColumns.EuroPerLiterAlcohol],
				standard_drinks: expected[DrunkColumns.Servings],
				estimated_promille: expected[DrunkColumns.EstimatedPromille],
				promille_per_euro: expected[DrunkColumns.PromillePerEuro]
			});
			// And the values match what the website's Kaljakori holds for the product.
			const item = catalog.kaljakori.findById(id)!;
			expect(product.alcohol_grams_per_euro).toBe(item[AllColumns.AlcoholGramsPerEuro]);
		}
		// 0.5 l × 40 % × 789 g/l = 157.8 g; 20 € / 0.2 l = 100 €/l of alcohol.
		expect(catalog.getProduct('100001').product.metrics).toMatchObject({
			alcohol_grams: 157.8,
			euro_per_liter_alcohol: 100,
			standard_drinks: 13.2
		});
	});

	it('reports alcohol-free products without a €/L alcohol value', () => {
		const { product } = catalog.getProduct('400004');
		expect(product.metrics.alcohol_grams).toBe(0);
		expect(product.euro_per_liter_alcohol).toBeNull();
	});

	it('includes the active sale', () => {
		const { product } = catalog.getProduct('200002');
		expect(product.sale).toEqual({
			sale_price_eur: 2.5,
			normal_price_eur: 2.99,
			discount_percent: 16,
			campaign_start: '2000-01-01',
			campaign_end: '2999-12-31'
		});
		expect(product.sale_discount_percent).toBe(16);
		expect(product.is_new).toBe(true);
	});

	it('accepts product URLs and IDs without leading zeros', () => {
		expect(catalog.getProduct('https://www.alko.fi/tuotteet/300003/chateau').product.id).toBe(
			'300003'
		);
		expect(catalog.getProduct('8003').product.id).toBe('008003');
	});

	it('rejects unknown and malformed product IDs cleanly', () => {
		expect(() => catalog.getProduct('999999')).toThrow(/No product with ID "999999"/);
		expect(() => catalog.getProduct('not an id')).toThrow(/not a valid product ID/);
		expect(() => catalog.getProduct('')).toThrow(ToolInputError);
	});

	it('parses product IDs', () => {
		expect(parseProductId(' 319027 ')).toBe('319027');
		expect(parseProductId('https://alkometriikka.fi/tuotteet/319027/')).toBe('319027');
		expect(parseProductId('abc')).toBeNull();
	});
});

describe('compare', () => {
	it('compares products and picks the best on each metric', () => {
		const result = catalog.compare(['100001', '300003', '200002', '404040']);
		expect(result.products.map((p) => p.id)).toEqual(['100001', '300003', '200002']);
		expect(result.not_found).toEqual(['404040']);
		expect(result.best.lowest_price?.id).toBe('200002');
		expect(result.best.lowest_price_per_liter?.id).toBe('200002');
		expect(result.best.highest_alcohol_percentage?.id).toBe('100001');
		const bestValue = Math.max(...result.products.map((p) => p.alcohol_grams_per_euro!));
		expect(result.best.most_alcohol_per_euro?.value).toBe(bestValue);
	});

	it('fails when no product is found', () => {
		expect(() => catalog.compare(['1', '2'])).toThrow(ToolInputError);
	});
});

describe('priceHistory', () => {
	it('returns the history sorted by date with a summary', () => {
		const result = catalog.priceHistory('100001');
		expect(result.history.map((entry) => entry.date)).toEqual([
			'2025-01-01',
			'2025-06-01',
			'2026-01-01'
		]);
		expect(result.summary).toEqual({
			tracked_since: '2025-01-01',
			recorded_prices: 3,
			first_price_eur: 19.5,
			lowest: { price_eur: 18.9, date: '2025-06-01' },
			highest: { price_eur: 20, date: '2026-01-01' },
			last_change_date: '2026-01-01',
			change_since_first_eur: 0.5,
			change_since_first_percent: 2.6
		});
	});

	it('keeps sale details and supports limiting', () => {
		const result = catalog.priceHistory('200002', 1);
		expect(result.history).toEqual([
			{
				date: '2026-09-01',
				price_eur: 2.5,
				normal_price_eur: 2.99,
				campaign_start: '2000-01-01',
				campaign_end: '2999-12-31'
			}
		]);
		expect(result.history_truncated).toBe(true);
	});

	it('handles products without history', () => {
		const result = catalog.priceHistory('400004');
		expect(result.history).toEqual([]);
		expect(result.summary).toBeNull();
	});
});

describe('storeAvailability', () => {
	it('lists stores and excludes non-store outlets', () => {
		const result = catalog.storeAvailability('100001', { limit: 25 });
		expect(result.available_store_count).toBe(2);
		expect(result.stores.map((store) => store.store_id)).toEqual(['2101', '2201']);
		expect(result.stores[0]).toMatchObject({ name: 'Helsinki keskusta Testi', city: 'HELSINKI' });
		expect(result.limitations.length).toBeGreaterThan(0);
		expect(result.dataset.availability_last_updated).toBe('2026-09-20T12:00:00.000Z');
	});

	it('narrows by city and store', () => {
		expect(catalog.storeAvailability('300003', { city: 'turku', limit: 25 }).stores).toHaveLength(
			1
		);
		expect(
			catalog.storeAvailability('300003', { store: 'tampere', limit: 25 }).matching_store_count
		).toBe(1);
		const limited = catalog.storeAvailability('300003', { limit: 1 });
		expect(limited.stores_truncated).toBe(true);
	});

	it('reports products that are in no store', () => {
		const result = catalog.storeAvailability('008003', { limit: 25 });
		expect(result.available_store_count).toBe(0);
		expect(result.selection).toBe('Tilausvalikoima');
	});

	it('says availability is unknown when it could not be loaded', () => {
		const result = fixtureCatalog({ withAvailability: false }).storeAvailability('100001', {
			limit: 25
		});
		expect(result.availability_data_loaded).toBe(false);
		expect(result.limitations[0]).toContain('unknown');
	});
});

describe('statistics and filter values', () => {
	it('summarises the catalog', () => {
		const stats = catalog.statistics();
		expect(stats).toMatchObject({
			product_count: 6,
			active_product_count: 5,
			removed_product_count: 1,
			on_sale_count: 1,
			new_product_count: 1,
			store_count: 4,
			price_range_eur: { min: 1.99, max: 20 }
		});
		expect(stats.categories).toContainEqual({ name: 'Viinit', count: 2 });
		expect(stats.best_alcohol_value[0]!.id).toBe('100001');
	});

	it('summarises one category', () => {
		const stats = catalog.statistics('viinit');
		expect(stats.scope).toBe('category: Viinit');
		expect(stats.product_count).toBe(2);
		expect(stats.subcategories).toHaveLength(2);
	});

	it('lists filter values with counts', () => {
		expect(catalog.filterValues('country').values).toContainEqual({ value: 'Suomi', count: 3 });
		expect(catalog.filterValues('grape', 'pinot').values).toEqual([
			{ value: 'Pinot Grigio', count: 1 }
		]);
		const stores = catalog.filterValues('store', 'tampere');
		expect(stores.values.map((v) => v.store_id)).toEqual(['2202', '2201']);
	});
});

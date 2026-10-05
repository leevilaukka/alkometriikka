import { describe, expect, it, mock } from 'bun:test';
import { AllColumns } from '$lib/utils/constants';
import type { PriceListItem } from '$lib/types';

// helpers.ts pulls in browser globals and SvelteKit modules through global.svelte.ts
mock.module('./helpers', () => ({
	headerToDisplayName: (header: string) => header,
	isNullish: (value: unknown) => value === null || value === undefined
}));
const { computeCategoryStats, histogram, histogramBinIndex, pickCategoryHighlights, recentPriceChanges } =
	await import('./metrics');

const product = (id: string, price: number, volume: number, alcohol: number, history: unknown[] = []) =>
	({
		[AllColumns.Number]: id,
		[AllColumns.Name]: `Product ${id}`,
		[AllColumns.Price]: price,
		[AllColumns.BottleSize]: volume,
		[AllColumns.PricePerLiter]: price / volume,
		[AllColumns.AlcoholPercentage]: alcohol,
		[AllColumns.AlcoholGramsPerEuro]: (volume * alcohol * 7.89) / price,
		[AllColumns.History]: history
	}) as unknown as PriceListItem;

describe('category stats', () => {
	it('computes medians', () => {
		const stats = computeCategoryStats([product('1', 10, 1, 5), product('2', 20, 1, 10), product('3', 30, 1, 40)]);
		expect(stats.medianPrice).toBe(20);
		expect(stats.medianPricePerLiter).toBe(20);
		expect(stats.medianAlcoholPercentage).toBe(10);
	});

	it('keeps outliers in the edge bins', () => {
		const values = [...Array.from({ length: 98 }, (_, i) => 10 + i / 10), 1, 1000];
		const bins = histogram(values, 5);
		expect(bins).toHaveLength(5);
		expect(bins.reduce((sum, bin) => sum + bin.count, 0)).toBe(values.length);
	});

	it('finds the bin of a value, clamping outliers to the edge bins', () => {
		const bins = histogram([...Array.from({ length: 100 }, (_, i) => i + 1)], 4);
		expect(histogramBinIndex(bins, -50)).toBe(0);
		expect(histogramBinIndex(bins, bins[1].from)).toBe(1);
		expect(histogramBinIndex(bins, 10_000)).toBe(3);
		expect(histogramBinIndex([], 5)).toBe(-1);
	});

	it('returns a single bin when all values are equal', () => {
		expect(histogram([5, 5, 5])).toEqual([{ from: 5, to: 5, count: 3 }]);
	});
});

describe('recentPriceChanges', () => {
	it('returns the latest change in the window, newest first', () => {
		const changes = recentPriceChanges(
			[
				product('1', 9, 1, 5, [
					{ date: '2026-08-01', price: 10 },
					{ date: '2026-09-10', price: 12 },
					{ date: '2026-09-20', price: 9, normalPrice: 12 }
				]),
				product('2', 10, 1, 5, [
					{ date: '2026-08-01', price: 8 },
					{ date: '2026-08-20', price: 10 }
				]),
				product('3', 11, 1, 5, [
					{ date: '2026-08-01', price: 10 },
					{ date: '2026-09-15', price: 11 }
				])
			],
			'2026-09-01'
		);
		expect(changes.map((change) => change.product[AllColumns.Number])).toEqual(['1', '3']);
		expect(changes[0]).toMatchObject({ from: 12, to: 9, percent: -25, sale: true });
		expect(changes[1].sale).toBe(false);
	});
});

describe('pickCategoryHighlights', () => {
	it('picks distinct standouts up to the limit', () => {
		const products = [
			product('cheap', 5, 0.33, 4.7),
			product('value', 20, 1, 40),
			product('liter', 15, 3, 5),
			product('other', 30, 0.7, 40),
			product('pricey', 90, 0.7, 13)
		];
		const ids = pickCategoryHighlights(products, 4).map((item) => item[AllColumns.Number]);
		expect(ids.slice(0, 3)).toEqual(['value', 'cheap', 'liter']);
		expect(new Set(ids).size).toBe(4);
	});
});

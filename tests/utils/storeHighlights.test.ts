import { describe, expect, it } from 'bun:test';
import { AllColumns } from '$lib/utils/constants/columns';
import type { PriceListItem } from '$lib/types';
import {
	bestValueByType,
	productsInStore,
	storeArrivals,
	storeSales
} from '$lib/utils/catalog/storeHighlights';

const product = (id: string, fields: Partial<Record<string, unknown>> = {}) =>
	({
		[AllColumns.Number]: id,
		[AllColumns.Type]: 'Viinit',
		[AllColumns.Price]: 10,
		[AllColumns.NormalPrice]: '',
		[AllColumns.AlcoholGramsPerEuro]: 5,
		[AllColumns.RemovedFromSelection]: false,
		...fields
	}) as unknown as PriceListItem;

describe('store highlights', () => {
	const a = product('1');
	const b = product('2', { [AllColumns.RemovedFromSelection]: true });
	const c = product('3');

	it('lists active products the store stocks', () => {
		const availability = { product: { '1': ['S'], '2': ['S'], '3': ['T'] } };
		expect(productsInStore([a, b, c], availability, 'S')).toEqual([a]);
	});

	it('keeps arrivals that are still stocked, in file order', () => {
		const file = {
			since: '2026-09-01',
			arrivals: [
				['3', '2026-10-20'],
				['9', '2026-10-19'],
				['1', '2026-10-18']
			] as [string, string][]
		};
		expect(storeArrivals(file, [a, c])).toEqual([
			{ product: c, date: '2026-10-20' },
			{ product: a, date: '2026-10-18' }
		]);
	});

	it('sorts sales by discount', () => {
		const small = product('4', { [AllColumns.Price]: 9, [AllColumns.NormalPrice]: 10 });
		const big = product('5', { [AllColumns.Price]: 5, [AllColumns.NormalPrice]: 10 });
		expect(storeSales([a, small, big]).map((entry) => entry.product)).toEqual([big, small]);
	});

	it('picks the best value per type, biggest types first', () => {
		const beer = product('6', { [AllColumns.Type]: 'Oluet', [AllColumns.AlcoholGramsPerEuro]: 3 });
		const bestWine = product('7', { [AllColumns.AlcoholGramsPerEuro]: 9 });
		const water = product('8', {
			[AllColumns.Type]: 'Alkoholittomat',
			[AllColumns.AlcoholGramsPerEuro]: 0
		});
		expect(bestValueByType([beer, a, bestWine, water])).toEqual([bestWine, beer]);
	});
});

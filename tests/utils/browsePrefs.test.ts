import { describe, expect, test } from 'bun:test';
import {
	emptyBrowsePrefs,
	arrangeFilters,
	preferredColumn,
	productVisibility,
	sanitizeBrowsePrefs
} from '../../src/lib/utils/user/browsePrefs';
import { AllColumns } from '../../src/lib/utils/constants/columns';
import type { PriceListItem } from '../../src/lib/types';

const product = (number: string, type: string, abv: number, subType = '') =>
	({
		[AllColumns.Number]: number,
		[AllColumns.Type]: type,
		[AllColumns.SubType]: subType,
		[AllColumns.AlcoholPercentage]: abv
	}) as unknown as PriceListItem;

describe('sanitizeBrowsePrefs', () => {
	test('falls back to the defaults for anything unusable', () => {
		expect(sanitizeBrowsePrefs(null)).toEqual(emptyBrowsePrefs());
		expect(sanitizeBrowsePrefs('x')).toEqual(emptyBrowsePrefs());
		expect(
			sanitizeBrowsePrefs({
				sort: 'nonsense',
				highlight: 3,
				hideAlcoholFree: 'yes',
				hiddenSubTypes: 1
			})
		).toEqual(emptyBrowsePrefs());
	});

	test('keeps offered columns and cleans the hidden types', () => {
		expect(
			sanitizeBrowsePrefs({
				sort: AllColumns.Price,
				highlight: AllColumns.Price,
				hideAlcoholFree: true,
				hiddenSubTypes: ['Ginit', 'Ginit', 4],
				hiddenFilters: [AllColumns.Sugar, 'nonsense'],
				pinnedFilters: [AllColumns.Price]
			})
		).toEqual({
			sort: AllColumns.Price,
			highlight: AllColumns.Price,
			hideAlcoholFree: true,
			hiddenSubTypes: ['Ginit'],
			hiddenFilters: [AllColumns.Sugar],
			pinnedFilters: [AllColumns.Price]
		});
	});
});

describe('preferredColumn', () => {
	test('uses the fallback without a choice or values for it', () => {
		expect(preferredColumn('', AllColumns.Price, () => true)).toBe(AllColumns.Price);
		expect(preferredColumn(AllColumns.Sugar, AllColumns.Price, () => false)).toBe(AllColumns.Price);
		expect(preferredColumn(AllColumns.Sugar, AllColumns.Price, () => true)).toBe(AllColumns.Sugar);
	});
});

describe('productVisibility', () => {
	const beer = product('1', 'oluet', 4.5);
	const zero = product('2', 'oluet', 0);
	const whisky = product('3', 'viskit', 40);

	test('is undefined when nothing is left out', () => {
		expect(productVisibility(emptyBrowsePrefs())).toBeUndefined();
	});

	test('hides alcohol free products', () => {
		const visible = productVisibility({
			...emptyBrowsePrefs(),
			hideAlcoholFree: true
		})!;
		expect([beer, zero, whisky].filter(visible)).toEqual([beer, whisky]);
	});

	test('hides chosen subtypes', () => {
		const gin = product('4', 'väkevät', 37.5, 'Ginit');
		const rum = product('5', 'väkevät', 40, 'Rommit');
		const visible = productVisibility({ ...emptyBrowsePrefs(), hiddenSubTypes: ['Ginit'] })!;
		expect([gin, rum].filter(visible)).toEqual([rum]);
	});

	test('limits to the products a store has', () => {
		const visible = productVisibility(emptyBrowsePrefs(), {
			id: 's1',
			availability: { product: { '1': ['s1'], '2': ['s2'] } }
		})!;
		expect([beer, zero, whisky].filter(visible)).toEqual([beer]);
	});
});

describe('arrangeFilters', () => {
	const filters = [
		AllColumns.Name,
		AllColumns.Price,
		AllColumns.Sugar,
		AllColumns.Country
	] as const;
	const prefs = (
		hiddenFilters: (typeof filters)[number][],
		pinnedFilters: (typeof filters)[number][]
	) => ({
		hiddenFilters,
		pinnedFilters
	});

	test('keeps the order without choices', () => {
		expect(arrangeFilters(filters, prefs([], []), () => false)).toEqual([...filters]);
	});

	test('puts pinned filters first and drops hidden ones', () => {
		expect(
			arrangeFilters(
				filters,
				prefs([AllColumns.Name], [AllColumns.Country, AllColumns.Sugar]),
				() => false
			)
		).toEqual([AllColumns.Sugar, AllColumns.Country, AllColumns.Price]);
	});

	test('keeps a hidden filter that has a value', () => {
		expect(
			arrangeFilters(
				filters,
				prefs([AllColumns.Price], []),
				(filter) => filter === AllColumns.Price
			)
		).toEqual([...filters]);
	});
});

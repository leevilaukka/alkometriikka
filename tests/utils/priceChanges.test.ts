import { describe, expect, it } from 'bun:test';
import { AllColumns } from '$lib/utils/constants';
import type { PriceListItem } from '$lib/types';
import type { PriceChange } from '$lib/utils/metrics';
import {
	countPriceChangesByCategory,
	DEFAULT_PRICE_CHANGE_WINDOW,
	filterPriceChangesByDirection,
	formatPriceChangeAmount,
	formatPriceChangeDate,
	formatPriceChangePercent,
	isInCategory,
	parsePriceChangeParams,
	priceChangeParams,
	priceChangesURL,
	priceChangeSince
} from '$lib/utils/priceChanges';

const product = (id: string, type: string, subType = '') =>
	({
		[AllColumns.Number]: id,
		[AllColumns.Type]: type,
		[AllColumns.SubType]: subType
	}) as unknown as PriceListItem;

const change = (item: PriceListItem, from: number, to: number): PriceChange => ({
	product: item,
	date: '2026-10-01',
	from,
	to,
	percent: ((to - from) / from) * 100,
	sale: false
});

describe('price change filters', () => {
	const wine = product('1', 'punaviinit', 'Täyteläinen & Pehmeä');
	const beer = product('2', 'Oluet', 'lager');
	const changes = [change(wine, 10, 8), change(beer, 2, 3)];

	it('filters by direction', () => {
		expect(filterPriceChangesByDirection(changes, 'all')).toHaveLength(2);
		expect(filterPriceChangesByDirection(changes, 'down').map((c) => c.product)).toEqual([wine]);
		expect(filterPriceChangesByDirection(changes, 'up').map((c) => c.product)).toEqual([beer]);
	});

	it('matches categories by slug', () => {
		expect(isInCategory(beer)).toBe(true);
		expect(isInCategory(beer, 'oluet')).toBe(true);
		expect(isInCategory(beer, 'oluet', 'lager')).toBe(true);
		expect(isInCategory(beer, 'oluet', 'ale')).toBe(false);
		expect(isInCategory(wine, 'punaviinit', 'taytelainen-pehmea')).toBe(true);
		expect(isInCategory(wine, 'oluet')).toBe(false);
	});

	it('counts changes per type and subtype', () => {
		const counts = countPriceChangesByCategory([...changes, change(product('3', 'oluet'), 1, 2)]);
		expect(counts.get('oluet')).toBe(2);
		expect(counts.get('oluet/lager')).toBe(1);
		expect(counts.get('punaviinit')).toBe(1);
	});
});

describe('price change params', () => {
	it('round-trips through the URL', () => {
		const options = {
			days: 7 as const,
			direction: 'down' as const,
			typeSlug: 'oluet',
			subTypeSlug: 'lager'
		};
		const params = new URLSearchParams(priceChangeParams(options));
		expect(params.get('suunta')).toBe('halpeni');
		expect(parsePriceChangeParams(params)).toEqual(options);
	});

	it('leaves defaults out and ignores unknown values', () => {
		expect(priceChangeParams({ days: DEFAULT_PRICE_CHANGE_WINDOW, direction: 'all' })).toEqual({
			pv: '',
			suunta: '',
			tyyppi: '',
			alatyyppi: ''
		});
		expect(
			parsePriceChangeParams(new URLSearchParams('pv=12&suunta=sivulle&alatyyppi=lager'))
		).toEqual({
			days: DEFAULT_PRICE_CHANGE_WINDOW,
			direction: 'all',
			typeSlug: undefined,
			subTypeSlug: undefined
		});
	});

	it('links to the page with only the non-default choices', () => {
		expect(priceChangesURL({ days: DEFAULT_PRICE_CHANGE_WINDOW, direction: 'all' })).toBe(
			'/hinnanmuutokset'
		);
		expect(
			priceChangesURL({
				days: DEFAULT_PRICE_CHANGE_WINDOW,
				direction: 'all',
				typeSlug: 'viinit',
				subTypeSlug: 'punaviinit'
			})
		).toBe('/hinnanmuutokset?tyyppi=viinit&alatyyppi=punaviinit');
		expect(priceChangesURL({ days: 7, direction: 'down', typeSlug: 'oluet' })).toBe(
			'/hinnanmuutokset?pv=7&suunta=halpeni&tyyppi=oluet'
		);
	});
});

describe('price change formatting', () => {
	it('computes the window start in Helsinki time', () => {
		// 21:30 UTC is already the next day in Helsinki
		expect(priceChangeSince(7, new Date('2026-10-04T21:30:00Z'))).toBe('2026-09-28');
	});

	it('formats dates and percentages', () => {
		expect(formatPriceChangeDate('2026-03-05')).toBe('5.3.');
		expect(formatPriceChangePercent(12.4)).toBe('+12 %');
		expect(formatPriceChangePercent(-5)).toBe('\u22125 %'); // fi-FI uses the Unicode minus sign
	});

	it('formats the change in euros with a sign', () => {
		const item = product('1', 'Viinit');
		expect(formatPriceChangeAmount(change(item, 40.17, 35.98))).toBe('\u22124,19 €');
		expect(formatPriceChangeAmount(change(item, 9.99, 12))).toBe('+2,01 €');
	});
});

import { afterEach, beforeEach, describe, expect, it, setSystemTime } from 'bun:test';
import { LEGACY_HEADERS, getHash, getHashValues } from '../../scripts/data/constants';
import {
	OVERDUE_ARRIVAL_DAYS,
	carryOverMissingProducts,
	clearRemovedFlag,
	detailCheckedMeta,
	detailVerifyAgeDays,
	isDetailRetryBackedOff,
	isDetailVerifyCandidate,
	isOverdueArrival,
	markStaleArrivals,
	mergeProduct,
	refreshSearchColumns,
	salesInfoFromValues,
	updatePriceHistory,
	valuesEqual,
	withoutRemovedFlag
} from '../../scripts/data/lifecycle';
import type {
	DetailedProductData,
	MigratedProduct,
	SearchProductData
} from '../../scripts/data/types';

const col = (name: (typeof LEGACY_HEADERS)[number]) => LEGACY_HEADERS.indexOf(name);

function values(fields: Partial<Record<(typeof LEGACY_HEADERS)[number], unknown>>): unknown[] {
	const row: unknown[] = Array(LEGACY_HEADERS.length).fill(null);
	for (const [name, value] of Object.entries(fields)) {
		row[col(name as (typeof LEGACY_HEADERS)[number])] = value;
	}
	return row;
}

function stored(
	id: string,
	fields: Partial<Record<(typeof LEGACY_HEADERS)[number], unknown>> = {},
	extra: Partial<MigratedProduct> = {}
): MigratedProduct {
	return {
		hash: `hash-${id}`,
		values: values({ Numero: id, Nimi: `Product ${id}`, Hinta: 10, Uutuus: 'uutuus', ...fields }),
		priceHistory: [],
		...extra
	};
}

const asSearch = (fields: Record<string, unknown>) => fields as unknown as SearchProductData;
const asDetails = (fields: Record<string, unknown>) => fields as unknown as DetailedProductData;

beforeEach(() => setSystemTime(new Date('2026-10-01T12:00:00Z')));
afterEach(() => setSystemTime());

describe('price history', () => {
	it('records the first price, ignores repeats and appends changes', () => {
		let history = updatePriceHistory(undefined, 10, null);
		expect(history).toEqual([{ date: '2026-10-01', price: 10 }]);

		setSystemTime(new Date('2026-10-02T12:00:00Z'));
		history = updatePriceHistory(history, 10, null);
		expect(history).toHaveLength(1);

		setSystemTime(new Date('2026-10-03T12:00:00Z'));
		history = updatePriceHistory(history, 12, null);
		expect(history).toEqual([
			{ date: '2026-10-01', price: 10 },
			{ date: '2026-10-03', price: 12 }
		]);
	});

	it('never mutates the previous history and keeps it when the price is unknown', () => {
		const previous = [{ date: '2026-09-01', price: 5 }];
		const next = updatePriceHistory(previous, 6, null);
		expect(previous).toHaveLength(1);
		expect(next).not.toBe(previous);
		expect(updatePriceHistory(previous, null, null)).toEqual(previous);
	});

	it('stores the campaign window with a sale price point', () => {
		const row = values({
			Hinta: 8,
			Normaalihinta: 10,
			'Kampanja alkaa': '2026-09-20',
			'Kampanja päättyy': '2026-10-10'
		});
		const sale = salesInfoFromValues(row);
		expect(sale).toMatchObject({ salePrice: 8, normalPrice: 10, discountPercent: 20 });
		expect(updatePriceHistory([], 8, sale)).toEqual([
			{
				date: '2026-10-01',
				price: 8,
				normalPrice: 10,
				campaignStart: '2026-09-20',
				campaignEnd: '2026-10-10'
			}
		]);
	});

	it('records a campaign that has not started yet, evaluated at its start date', () => {
		const row = values({
			Hinta: 8,
			Normaalihinta: 10,
			'Kampanja alkaa': '2026-10-15',
			'Kampanja päättyy': '2026-10-31'
		});
		expect(salesInfoFromValues(row)).toMatchObject({ campaignStart: '2026-10-15' });
	});

	it('reports no sale for expired campaigns and for full-price products', () => {
		expect(
			salesInfoFromValues(
				values({
					Hinta: 8,
					Normaalihinta: 10,
					'Kampanja alkaa': '2026-08-01',
					'Kampanja päättyy': '2026-08-31'
				})
			)
		).toBeNull();
		expect(salesInfoFromValues(values({ Hinta: 10, Normaalihinta: 10 }))).toBeNull();
		expect(salesInfoFromValues(values({ Hinta: 10 }))).toBeNull();
	});
});

describe('removed-from-selection flag', () => {
	it('withoutRemovedFlag drops the flag and collapses empty meta', () => {
		expect(withoutRemovedFlag(undefined)).toBeUndefined();
		expect(withoutRemovedFlag({ removedFromSelection: '2026-09-01' })).toBeUndefined();
		expect(
			withoutRemovedFlag({ removedFromSelection: '2026-09-01', detailCheckedAt: '2026-08-01' })
		).toEqual({ detailCheckedAt: '2026-08-01' });
	});

	it('clearRemovedFlag keeps other meta and removes meta entirely when empty', () => {
		const active = stored('1');
		expect(clearRemovedFlag(active)).toBe(active);

		const onlyFlag = stored('2', {}, { meta: { removedFromSelection: '2026-09-01' } });
		expect('meta' in clearRemovedFlag(onlyFlag)).toBe(false);

		const withCheck = stored(
			'3',
			{},
			{ meta: { removedFromSelection: '2026-09-01', detailCheckedAt: '2026-08-01' } }
		);
		expect(clearRemovedFlag(withCheck).meta).toEqual({ detailCheckedAt: '2026-08-01' });
	});
});

describe('carryOverMissingProducts', () => {
	const run = (
		existing: Record<string, MigratedProduct>,
		products: Record<string, MigratedProduct>,
		apiIds: string[],
		irrelevantIds: string[] = []
	) =>
		carryOverMissingProducts(
			existing,
			products,
			new Set(apiIds),
			new Set(irrelevantIds),
			'2026-10-01'
		);

	it('flags a product missing from the API as removed today and clears its "Uutuus" mark', () => {
		const existing = { '1': stored('1', { Tila: 'Uutuus' }) };
		const products: Record<string, MigratedProduct> = {};
		const result = run(existing, products, []);

		expect(result).toEqual({ removed: 1, filteredRemoved: 0 });
		expect(products['1']!.meta?.removedFromSelection).toBe('2026-10-01');
		expect(products['1']!.values[col('Uutuus')]).toBeNull();
		expect(products['1']!.values[col('Tila')]).toBeNull();
		// The product itself, price history and hash are kept: nothing is ever deleted.
		expect(products['1']!.hash).toBe('hash-1');
	});

	it('keeps the original removal date on later runs without counting it again', () => {
		const existing = {
			'1': stored('1', {}, { meta: { removedFromSelection: '2026-09-01' } })
		};
		const products: Record<string, MigratedProduct> = {};
		const result = run(existing, products, []);

		expect(result.removed).toBe(0);
		expect(products['1']!.meta?.removedFromSelection).toBe('2026-09-01');
	});

	it('reactivates a flagged product that is back in the API', () => {
		const existing = {
			'1': stored('1', {}, { meta: { removedFromSelection: '2026-09-01' } })
		};
		const products: Record<string, MigratedProduct> = {};
		const result = run(existing, products, ['1']);

		expect(result.removed).toBe(0);
		expect(products['1']!.meta?.removedFromSelection).toBeUndefined();
	});

	it('skips products already rebuilt this run and entries that are not products', () => {
		const rebuilt = stored('1', { Hinta: 99 });
		const products = { '1': rebuilt };
		const result = run(
			{ '1': stored('1'), junk: { nope: true } as unknown as MigratedProduct },
			products,
			[]
		);

		expect(result).toEqual({ removed: 0, filteredRemoved: 0 });
		expect(products['1']).toBe(rebuilt);
		expect('junk' in products).toBe(false);
	});

	it('drops irrelevant products (gifts & accessories) instead of flagging them removed', () => {
		const existing = {
			'1': stored('1'),
			'2': stored('2', { Tyyppi: 'Lahja- ja juomatarvikkeet' })
		};
		const products: Record<string, MigratedProduct> = {};
		const result = run(existing, products, [], ['1']);

		expect(result).toEqual({ removed: 0, filteredRemoved: 2 });
		expect(products).toEqual({});
	});
});

describe('full product lifecycle across sync runs', () => {
	it('goes added → price change → removed → restored with history intact', () => {
		// Run 1 (Oct 1): product first appears.
		let product: MigratedProduct = {
			hash: 'h1',
			values: values({ Numero: '1', Hinta: 10, Uutuus: 'uutuus' }),
			priceHistory: updatePriceHistory(undefined, 10, null),
			meta: { detailCheckedAt: '2026-10-01' }
		};
		expect(product.priceHistory).toEqual([{ date: '2026-10-01', price: 10 }]);

		// Run 2 (Oct 8): price drops.
		setSystemTime(new Date('2026-10-08T12:00:00Z'));
		product = {
			...product,
			hash: 'h2',
			values: values({ Numero: '1', Hinta: 8, Uutuus: 'uutuus' }),
			priceHistory: updatePriceHistory(product.priceHistory, 8, null)
		};
		expect(product.priceHistory.map((point) => point.price)).toEqual([10, 8]);

		// Run 3 (Oct 15): gone from the API.
		setSystemTime(new Date('2026-10-15T12:00:00Z'));
		let products: Record<string, MigratedProduct> = {};
		carryOverMissingProducts({ '1': product }, products, new Set(), new Set(), '2026-10-15');
		expect(products['1']!.meta).toEqual({
			detailCheckedAt: '2026-10-01',
			removedFromSelection: '2026-10-15'
		});

		// Run 4 (Oct 22): still gone, date is not bumped.
		setSystemTime(new Date('2026-10-22T12:00:00Z'));
		const existing = products;
		products = {};
		const second = carryOverMissingProducts(existing, products, new Set(), new Set(), '2026-10-22');
		expect(second.removed).toBe(0);
		expect(products['1']!.meta?.removedFromSelection).toBe('2026-10-15');

		// Run 5 (Oct 29): back in the API at the same price. Unchanged hash → just clear the flag.
		setSystemTime(new Date('2026-10-29T12:00:00Z'));
		const restored = clearRemovedFlag(products['1']!);
		expect(restored.meta).toEqual({ detailCheckedAt: '2026-10-01' });
		expect(restored.priceHistory.map((point) => point.price)).toEqual([10, 8]);
		expect(updatePriceHistory(restored.priceHistory, 8, null)).toHaveLength(2);
	});
});

describe('detail verification staleness', () => {
	it('treats products that were never verified as infinitely stale', () => {
		expect(detailVerifyAgeDays(stored('1'))).toBe(Infinity);
		expect(detailVerifyAgeDays(stored('1', {}, { meta: { detailCheckedAt: 'garbage' } }))).toBe(
			Infinity
		);
		expect(isDetailVerifyCandidate(stored('1'), 30)).toBe(true);
	});

	it('becomes a candidate only after the cooldown has passed', () => {
		const product = stored('1', {}, { meta: { detailCheckedAt: '2026-09-01' } });
		expect(detailVerifyAgeDays(product)).toBeCloseTo(30.5, 1);
		expect(isDetailVerifyCandidate(product, 31)).toBe(false);
		expect(isDetailVerifyCandidate(product, 30)).toBe(true);
	});

	it('backs off retries only while the last failure is recent', () => {
		expect(isDetailRetryBackedOff(stored('1'), 7)).toBe(false);
		const failed = stored('1', {}, { meta: { detailFailedAt: '2026-09-26' } });
		expect(isDetailRetryBackedOff(failed, 7)).toBe(true);
		expect(isDetailRetryBackedOff(failed, 5)).toBe(false);
	});

	it('clears the failure date once the details are fetched', () => {
		expect(
			detailCheckedMeta(
				{ detailCheckedAt: '2026-08-01', detailFailedAt: '2026-09-26' },
				'2026-10-01'
			)
		).toEqual({ detailCheckedAt: '2026-10-01' });
	});
});

describe('stale arrivals', () => {
	const now = Date.parse('2026-10-01T12:00:00Z');
	const daysAgo = (days: number) => Math.floor((now - days * 86_400_000) / 1000);
	const arrival = (fields: Record<string, unknown> = {}) =>
		asSearch({
			id: '1',
			statusId: 'X',
			onlineAvailability: false,
			storeId: [],
			onlineAvailabilityDatetimeTs: daysAgo(OVERDUE_ARRIVAL_DAYS + 1),
			...fields
		});
	const failed = { meta: { detailFailedAt: '2026-09-28' } };

	it('is overdue when listed as coming months after its launch date, with no stock', () => {
		expect(isOverdueArrival(arrival(), now)).toBe(true);
		expect(isOverdueArrival(arrival({ statusId: 'A' }), now)).toBe(false);
		expect(
			isOverdueArrival(
				arrival({ onlineAvailabilityDatetimeTs: daysAgo(OVERDUE_ARRIVAL_DAYS - 1) }),
				now
			)
		).toBe(false);
		expect(isOverdueArrival(arrival({ storeId: ['2102'] }), now)).toBe(false);
		expect(isOverdueArrival(arrival({ onlineAvailability: true }), now)).toBe(false);
		expect(isOverdueArrival(arrival({ onlineAvailabilityDatetimeTs: null }), now)).toBe(false);
	});

	it('labels only overdue arrivals whose details failed', () => {
		const products = {
			'1': stored('1', { Tila: 'Tulee' }, failed),
			'2': stored('2', { Tila: 'Tulee' }),
			'3': stored('3', { Tila: 'Tulee' }, failed)
		};
		const delayed = arrival({ id: '2' });
		const recent = arrival({ id: '3', onlineAvailabilityDatetimeTs: daysAgo(10) });

		expect(markStaleArrivals(products, [arrival(), delayed, recent], now)).toBe(1);
		expect(products['1'].values[col('Tila')]).toBe('Ei myynnissä');
		expect(products['2'].values[col('Tila')]).toBe('Tulee');
		expect(products['3'].values[col('Tila')]).toBe('Tulee');

		const unchanged = products['1'];
		markStaleArrivals(products, [arrival()], now);
		expect(products['1']).toBe(unchanged);
	});

	it('restores the status once the details come back or the product launches', () => {
		const launched = { '1': stored('1', { Tila: 'Ei myynnissä' }, failed) };
		markStaleArrivals(launched, [arrival({ statusId: 'A', storeId: ['2102'] })], now);
		expect(launched['1'].values[col('Tila')]).toBe('Aktiivinen');

		const recovered = { '1': stored('1', { Tila: 'Ei myynnissä' }) };
		markStaleArrivals(recovered, [arrival()], now);
		expect(recovered['1'].values[col('Tila')]).toBe('Tulee');
	});

	it('hashes the label like the Tulee the search API reports', () => {
		const coming = values({ Numero: '1', Hinta: 3, Tila: 'Tulee' });
		const stale = values({ Numero: '1', Hinta: 3, Tila: 'Ei myynnissä' });
		const active = values({ Numero: '1', Hinta: 3, Tila: 'Aktiivinen' });
		expect(getHash(getHashValues(stale))).toBe(getHash(getHashValues(coming)));
		expect(getHash(getHashValues(active))).not.toBe(getHash(getHashValues(coming)));
	});
});

describe('change detection', () => {
	it('valuesEqual compares arrays deeply and uses Object.is for scalars', () => {
		expect(valuesEqual(['a', ['b']], ['a', ['b']])).toBe(true);
		expect(valuesEqual(['a'], ['a', 'b'])).toBe(false);
		expect(valuesEqual(NaN, NaN)).toBe(true);
		expect(valuesEqual(null, undefined)).toBe(false);
	});

	it('hash ignores the order and padding of array fields but notices real changes', () => {
		const base = values({ Numero: '1', Nimi: 'Olut', Hinta: 3, Luonnehdinta: ['b', 'a'] });
		const reordered = values({ Numero: '1', Nimi: 'Olut', Hinta: 3, Luonnehdinta: [' a', 'b '] });
		const repriced = values({ Numero: '1', Nimi: 'Olut', Hinta: 4, Luonnehdinta: ['b', 'a'] });

		expect(getHash(getHashValues(base))).toBe(getHash(getHashValues(reordered)));
		expect(getHash(getHashValues(base))).not.toBe(getHash(getHashValues(repriced)));
	});
});

describe('mergeProduct', () => {
	it('lets detail data win, except campaign fields where the search format is canonical', () => {
		const search = asSearch({
			id: '1',
			price: 1.19,
			name: 'search name',
			lowest_30d_price: '1.1900',
			campaign_start_date: '2026-09-20',
			campaign_end_date: null
		});
		const details = asDetails({
			name: 'detail name',
			lowest_30d_price: 119,
			campaign_start_date: '2026-09-20T00:00:00Z',
			campaign_end_date: '2026-10-10T00:00:00Z'
		});
		const merged = mergeProduct(search, details);

		expect(merged.name).toBe('detail name');
		expect(merged.price).toBe(1.19);
		expect(merged.lowest_30d_price).toBe('1.1900');
		expect(merged.campaign_start_date).toBe('2026-09-20');
		// Search has no end date, so the detail value is used.
		expect(merged.campaign_end_date).toBe('2026-10-10T00:00:00Z');
	});
});

describe('refreshSearchColumns', () => {
	it('copies the refreshed search columns into an unchanged product', () => {
		const previous = stored('1', { Ruokasuositukset: null });
		const refreshed = refreshSearchColumns(
			previous,
			values({ Nimi: 'Other name', Ruokasuositukset: 'Porsas, Nauta' })
		);
		expect(refreshed.values[col('Ruokasuositukset')]).toBe('Porsas, Nauta');
		// Only the refreshed columns are touched
		expect(refreshed.values[col('Nimi')]).toBe('Product 1');
		expect(previous.values[col('Ruokasuositukset')]).toBeNull();
	});

	it('returns the same product when nothing changed', () => {
		const previous = stored('1', { Ruokasuositukset: 'Porsas' });
		expect(refreshSearchColumns(previous, values({ Ruokasuositukset: 'Porsas' }))).toBe(previous);
	});
});

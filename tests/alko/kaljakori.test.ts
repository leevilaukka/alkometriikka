import { beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { DATASET_INDEX_VERSION, Kaljakori } from '$lib/alko';
import { AllColumns, DatasetColumns, GenderOptionsMap } from '$lib/utils/constants';
import type { AvailabilityData, DatasetRow } from '$lib/types';
import { parseDataset } from '$lib/utils/dataset';

const header = [...Object.values(DatasetColumns)];
type Fields = Partial<Record<keyof typeof DatasetColumns, unknown>>;

/** Builds a dataset row in the same column order `parseDataset` produces. */
function row(fields: Fields): DatasetRow {
	const values: unknown[] = Array(header.length).fill(null);
	for (const [key, value] of Object.entries(fields)) {
		values[header.indexOf(DatasetColumns[key as keyof typeof DatasetColumns])] = value;
	}
	return values as DatasetRow;
}

const base = (id: string, fields: Fields = {}): DatasetRow =>
	row({
		Number: id,
		Name: `Olut ${id}`,
		Manufacturer: 'Panimo',
		BottleSize: 0.5,
		Price: 2,
		PricePerLiter: 4,
		Type: 'oluet',
		SubType: 'lager',
		Country: 'Suomi',
		AlcoholPercentage: 5,
		Description: 'Raikas, Humalainen',
		History: [],
		RemovedFromSelection: false,
		...fields
	});

const build = (rows: DatasetRow[], availability?: AvailabilityData) => {
	const silence = spyOn(console, 'log').mockImplementation(() => {});
	const alko = new Kaljakori([header as unknown as DatasetRow, ...rows], undefined, availability);
	silence.mockRestore();
	return alko;
};

const column = (name: string) => name as never;

describe('Kaljakori row parsing', () => {
	it('keeps valid products and skips accessories and rows without ABV or price', () => {
		const alko = build([
			base('1'),
			base('2', { Availability: 'tarvikevalikoima' }),
			base('3', { AlcoholPercentage: null }),
			base('4', { AlcoholPercentage: '' }),
			base('5', { Price: undefined }),
			base('6', { Price: '' })
		]);
		expect(alko.data.map((item) => item[AllColumns.Number])).toEqual(['1']);
	});

	it('keeps a 0% product (alcohol-free) because only a missing ABV is skipped', () => {
		expect(build([base('1', { AlcoholPercentage: 0 })]).data).toHaveLength(1);
	});

	it('formats strings, parses numerics and splits descriptions into sets', () => {
		const [item] = build([
			base('007', { Name: 'lapin kulta', Description: 'Raikas, humalainen. Maltainen' })
		]).data;
		expect(item[AllColumns.Number]).toBe('007'); // string-handled, never coerced to 7
		expect(item[AllColumns.Name]).toBe('Lapin kulta');
		expect(item[AllColumns.AlcoholPercentage]).toBe(5);
		expect(item[AllColumns.Description]).toEqual(new Set(['Raikas', 'Humalainen', 'Maltainen']));
	});

	it('defaults numeric-looking-missing columns to 0 only for undefined-to-zero columns', () => {
		const [item] = build([base('1', { Sugar: undefined, Region: undefined })]).data;
		expect(item[AllColumns.Sugar]).toBe(0);
		expect(item[AllColumns.Region]).toBe('');
	});

	it('infers a missing bottle size from price / price-per-liter, else falls back to 1 l', () => {
		const inferred = build([base('1', { BottleSize: '', Price: 3, PricePerLiter: 6 })]).data[0];
		expect(inferred[AllColumns.BottleSize]).toBe(0.5);
		const implausible = build([base('2', { BottleSize: '', Price: 3, PricePerLiter: 3000 })])
			.data[0];
		expect(implausible[AllColumns.BottleSize]).toBe(1);
		const unknown = build([base('3', { BottleSize: '', PricePerLiter: '' })]).data[0];
		expect(unknown[AllColumns.BottleSize]).toBe(1);
	});

	it('parses comma-decimal bottle sizes', () => {
		expect(build([base('1', { BottleSize: '0,33 l' })]).data[0][AllColumns.BottleSize]).toBe(0.33);
	});

	it('fills a missing Type and falls back SubType to beer type, then type', () => {
		const alko = build([
			base('1', { Type: '', SubType: '' }),
			base('2', { SubType: '', BeerType: 'ipa' }),
			base('3', { SubType: '', BeerType: '' })
		]);
		const byId = (id: string) => alko.findById(id)!;
		expect(byId('1')[AllColumns.Type]).toBe('Ei määritelty');
		expect(byId('1')[AllColumns.SubType]).toBe('Ei määritelty');
		expect(byId('2')[AllColumns.SubType]).toBe('Ipa');
		expect(byId('3')[AllColumns.SubType]).toBe('Oluet');
	});

	it('preserves price history as an array and the removed flag as a boolean', () => {
		const history = [{ date: '2026-09-01', price: 3 }];
		const alko = build([
			base('1', { History: history, RemovedFromSelection: true }),
			base('2', { History: 'bad', RemovedFromSelection: 0 })
		]);
		expect(alko.findById('1')![AllColumns.History]).toEqual(history);
		expect(alko.findById('1')![AllColumns.RemovedFromSelection]).toBe(true);
		expect(alko.findById('2')![AllColumns.History]).toEqual([]);
		expect(alko.findById('2')![AllColumns.RemovedFromSelection]).toBe(false);
	});
});

describe('Kaljakori calculated columns', () => {
	it('computes drunk values and honours personal info', () => {
		const rows = [base('1', { BottleSize: 0.5, AlcoholPercentage: 5, Price: 2 })];
		const silence = spyOn(console, 'log').mockImplementation(() => {});
		const table = [header as unknown as DatasetRow, ...rows];
		const neutral = new Kaljakori(table).data[0];
		const heavy = new Kaljakori(structuredClone(table), {
			weight: 150,
			gender: GenderOptionsMap.Male
		}).data[0];
		silence.mockRestore();

		expect(neutral[AllColumns.AlcoholGrams]).toBeCloseTo(0.5 * 0.05 * 789, 1);
		expect(neutral[AllColumns.AlcoholGramsPerEuro]).toBeCloseTo((0.5 * 0.05 * 789) / 2, 1);
		expect(heavy[AllColumns.AlcoholGrams]).toBe(neutral[AllColumns.AlcoholGrams]);
		expect(heavy[AllColumns.EstimatedPromille]).toBeLessThan(neutral[AllColumns.EstimatedPromille]);
	});

	it('flags sales via normal price and sorts by alcohol per euro by default', () => {
		const alko = build([
			base('cheap', { Price: 1 }),
			base('sale', { Price: 2, NormalPrice: 3 }),
			base('pricey', { Price: 4, NormalPrice: 4 })
		]);
		expect(alko.findById('Sale')![AllColumns.OnSale]).toBe('alennuksessa');
		expect(alko.findById('Pricey')![AllColumns.OnSale]).toBe('');
		expect(alko.data.map((item) => item[AllColumns.Number])).toEqual(['Pricey', 'Sale', 'Cheap']);
		expect(alko.getFilterValues(column(AllColumns.OnSale))).toEqual(['alennuksessa']);
	});

	it('resolves store availability names from availability.json and drops unknown stores', () => {
		const availability = {
			lastUpdated: '2026-10-01T00:00:00Z',
			stores: {
				s1: { id: 's1', name: 'Alko Kamppi' },
				s2: { id: 's2', name: 'Alko Kallio' }
			},
			product: { '1': ['s1', 's2', 'ghost'], '2': [] }
		} as unknown as AvailabilityData;
		const alko = build([base('1'), base('2'), base('3')], availability);

		expect(alko.findById('1')![AllColumns.StoreAvailability]).toEqual(
			new Set(['Alko Kamppi', 'Alko Kallio'])
		);
		expect(alko.findById('2')![AllColumns.StoreAvailability]).toEqual(new Set());
		expect(alko.findById('3')![AllColumns.StoreAvailability]).toEqual(new Set());
		expect(alko.getFilterValues(column(AllColumns.StoreAvailability))).toEqual([
			'Alko Kallio',
			'Alko Kamppi'
		]);
	});
});

describe('Kaljakori removed products', () => {
	let alko: Kaljakori;
	beforeEach(() => {
		alko = build([
			base('1', { Country: 'Suomi', Price: 2 }),
			base('2', { Country: 'Saksa', Price: 50, RemovedFromSelection: true })
		]);
	});

	it('keeps removed products in data but hides their values from the active buckets', () => {
		expect(alko.data).toHaveLength(2);
		expect(alko.getFilterValues(column(AllColumns.Country))).toEqual(['Saksa', 'Suomi']);
		expect(alko.getFilterValues(column(AllColumns.Country), false)).toEqual(['Suomi']);
	});

	it('computes active min/max without removed products', () => {
		expect(alko.getMinAndMaxValues(column(AllColumns.Price))).toEqual([2, 50]);
		expect(alko.getMinAndMaxValues(column(AllColumns.Price), false)).toEqual([2, 2]);
	});

	it('excludes removed products from sub-filter options when asked', () => {
		const withRemoved = build([
			base('1', { Type: 'oluet', SubType: 'lager' }),
			base('2', { Type: 'oluet', SubType: 'stout', RemovedFromSelection: true })
		]);
		expect(withRemoved.getSubFilterValues(column(AllColumns.Type), {} as never).sort()).toEqual([
			'Lager',
			'Stout'
		]);
		expect(withRemoved.getSubFilterValues(column(AllColumns.Type), {} as never, false)).toEqual([
			'Lager'
		]);
	});
});

describe('Kaljakori querying', () => {
	const alko = () =>
		build([
			base('1', { Name: 'Karhu', Country: 'Suomi', Price: 2, AlcoholPercentage: 4.5 }),
			base('2', { Name: 'Lapin Kulta', Country: 'Suomi', Price: 3, AlcoholPercentage: 5.2 }),
			base('3', { Name: 'Paulaner', Country: 'Saksa', Price: 4, AlcoholPercentage: 5.5 })
		]);

	it('infers column types and numeric ranges', () => {
		const k = alko();
		expect(k.getFilterType(column(AllColumns.Price))).toBe('number');
		expect(k.getFilterType(column(AllColumns.Country))).toBe('string');
		expect(k.getFilterType(column(AllColumns.Description))).toBe('object');
		expect(k.getMinAndMaxValues(column(AllColumns.Price))).toEqual([2, 4]);
		expect(k.getMinAndMaxValues(column(AllColumns.SortingCode))).toEqual([0, 0]);
	});

	it('filters by value lists, numeric ranges and ignores empty filters', () => {
		const k = alko();
		expect(k.filter({ [AllColumns.Country]: ['Saksa'] })).toHaveLength(1);
		expect(k.filter({ [AllColumns.Price]: [2, 3] })).toHaveLength(2);
		expect(k.filter({ [AllColumns.Country]: [], [AllColumns.Price]: new Set() })).toHaveLength(3);
		expect(
			k
				.filter({ [AllColumns.Country]: new Set(['Suomi']), [AllColumns.Price]: [3, 4] })
				.map((i) => i[AllColumns.Name])
		).toEqual(['Lapin Kulta']);
		expect(k.filterByRange(column(AllColumns.AlcoholPercentage), 5, 6)).toHaveLength(2);
	});

	it('fuzzy-searches names and combines with filters', () => {
		const k = alko();
		expect(
			k.fuzzySearch(column(AllColumns.Name), 'lapin').map((i) => i[AllColumns.Number])
		).toEqual(['2']);
		expect(
			k
				.fuzzySearchAndFilter('a', { [AllColumns.Country]: ['Saksa'] })
				.map((i) => i[AllColumns.Number])
		).toEqual(['3']);
	});

	it('fuzzy-matches every word of a value, not just the first', () => {
		const k = alko();
		// "kultta" is a typo of the second word of "Lapin Kulta"
		expect(
			k.fuzzySearch(column(AllColumns.Name), 'kultta').map((i) => i[AllColumns.Number])
		).toEqual(['2']);
		expect(k.fuzzySearch(column(AllColumns.Name), 'lapn').map((i) => i[AllColumns.Number])).toEqual(
			['2']
		);
		expect(k.fuzzySearch(column(AllColumns.Name), 'xyzzy')).toEqual([]);
	});

	it('looks products up and sorts in both directions', () => {
		const k = alko();
		expect(k.findById('2')![AllColumns.Name]).toBe('Lapin Kulta');
		expect(k.findById('nope')).toBeUndefined();
		expect(k.findByColumn(column(AllColumns.Country), 'Suomi')).toHaveLength(2);
		expect(k.sortBy(column(AllColumns.Price), false).map((i) => i[AllColumns.Number])).toEqual([
			'3',
			'2',
			'1'
		]);
		expect(k.sortBy(column(AllColumns.Price)).map((i) => i[AllColumns.Number])).toEqual([
			'1',
			'2',
			'3'
		]);
	});

	it('lists filter keys including drunk, store and calculated columns', () => {
		const keys = alko().getFilterKeys();
		for (const key of [
			AllColumns.Price,
			AllColumns.AlcoholGrams,
			AllColumns.StoreAvailability,
			AllColumns.OnSale
		])
			expect(keys).toContain(key);
	});
});

describe('dataset → Kaljakori round trip', () => {
	it('turns a stored data.json into the app model, including removed products and history', () => {
		const values = (id: string) => base(id).slice(0, header.indexOf(AllColumns.History));
		const json = JSON.stringify({
			schema: header.slice(0, header.indexOf(AllColumns.History)),
			metadata: { LastUpdated: '2026-10-01T00:00:00Z', LastSynced: '2026-10-01T00:00:00Z' },
			products: {
				'1': { hash: 'a', values: values('1'), priceHistory: [{ date: '2026-09-01', price: 2 }] },
				'2': {
					hash: 'b',
					values: values('2'),
					priceHistory: [],
					meta: { removedFromSelection: '2026-09-30' }
				}
			}
		});
		const [, ...rows] = parseDataset(json).table as DatasetRow[];
		const alko = build(rows);

		expect(alko.data).toHaveLength(2);
		expect(alko.findById('1')![AllColumns.History]).toEqual([{ date: '2026-09-01', price: 2 }]);
		expect(alko.findById('1')![AllColumns.RemovedFromSelection]).toBe(false);
		expect(alko.findById('2')![AllColumns.RemovedFromSelection]).toBe(true);
	});
});

describe('Kaljakori store availability loaded later', () => {
	const availability = {
		stores: { s1: { id: 's1', name: 'Alko Kamppi' }, s2: { id: 's2', name: 'Alko Kallio' } },
		product: { '1': ['s1', 's2'], '2': ['s2'] }
	} as unknown as AvailabilityData;
	const rows = () => [base('1'), base('2', { RemovedFromSelection: true }), base('3')];

	it('ends up the same as passing availability to the constructor', () => {
		const upfront = build(rows(), availability);
		const later = build(rows());
		expect(later.getFilterValues(column(AllColumns.StoreAvailability))).toEqual([]);
		later.setAvailability(availability);

		const stores = (k: Kaljakori) =>
			k.data.map((item) => [item[AllColumns.Number], [...item[AllColumns.StoreAvailability]]]);
		expect(stores(later)).toEqual(stores(upfront));
		for (const showRemoved of [true, false])
			expect(later.getFilterValues(column(AllColumns.StoreAvailability), showRemoved)).toEqual(
				upfront.getFilterValues(column(AllColumns.StoreAvailability), showRemoved)
			);
		expect(later.getFilterValues(column(AllColumns.StoreAvailability), false)).toEqual([
			'Alko Kallio',
			'Alko Kamppi'
		]);
		expect(
			later
				.fuzzySearchAndFilter('', { [AllColumns.StoreAvailability]: new Set(['Alko Kamppi']) })
				.map((item) => item[AllColumns.Number])
		).toEqual(['1']);
	});
});

describe('Kaljakori subsets and late store availability', () => {
	it('updates the store filter of subsets made before availability loaded', () => {
		const p = build([base('1'), base('2')]);
		const heavy = p.subset(p.data, { weight: 150, gender: GenderOptionsMap.Male });
		const same = p.subset(p.data.slice(0, 1));
		expect(heavy.getFilterValues(column(AllColumns.StoreAvailability))).toEqual([]);
		expect(same.getFilterValues(column(AllColumns.StoreAvailability))).toEqual([]);

		p.setAvailability({
			stores: { s1: { id: 's1', name: 'Alko Kamppi' }, s2: { id: 's2', name: 'Alko Kallio' } },
			product: { '1': ['s1'], '2': ['s2'] }
		} as unknown as AvailabilityData);

		expect(heavy.getFilterValues(column(AllColumns.StoreAvailability))).toEqual([
			'Alko Kallio',
			'Alko Kamppi'
		]);
		expect(same.getFilterValues(column(AllColumns.StoreAvailability))).toEqual(['Alko Kamppi']);
		expect(
			heavy
				.fuzzySearchAndFilter('', { [AllColumns.StoreAvailability]: new Set(['Alko Kallio']) })
				.map((item) => item[AllColumns.Number])
		).toEqual(['2']);
	});
});

describe('Kaljakori subsets', () => {
	const parent = () =>
		build([
			base('1', { Country: 'Suomi', Price: 2 }),
			base('2', { Country: 'Saksa', Price: 4 }),
			base('3', { Country: 'Ranska', Price: 9, RemovedFromSelection: true })
		]);

	it('matches a Kaljakori built from just those rows', () => {
		const rows = [
			base('1', { Country: 'Suomi', Price: 2 }),
			base('3', { Country: 'Ranska', Price: 9, RemovedFromSelection: true })
		];
		const direct = build(rows);
		const p = parent();
		const subset = p.subset(p.data.filter((item) => item[AllColumns.Number] !== '2'));

		expect(subset.data).toEqual(direct.data);
		for (const key of [AllColumns.Country, AllColumns.Price, AllColumns.AlcoholGramsPerEuro]) {
			expect(subset.getFilterType(column(key))).toBe(direct.getFilterType(column(key)));
			for (const showRemoved of [true, false]) {
				expect(subset.getFilterValues(column(key), showRemoved)).toEqual(
					direct.getFilterValues(column(key), showRemoved)
				);
				expect(subset.getMinAndMaxValues(column(key), showRemoved)).toEqual(
					direct.getMinAndMaxValues(column(key), showRemoved)
				);
			}
		}
		// The parent keeps its own values
		expect(p.getFilterValues(column(AllColumns.Country))).toEqual(['Ranska', 'Saksa', 'Suomi']);
	});

	it('recomputes drunk values when personal info changed, leaving the parent as is', () => {
		const p = parent();
		const before = p.findById('1')![AllColumns.EstimatedPromille];
		const heavy = p.subset(p.data, { weight: 150, gender: GenderOptionsMap.Male });
		expect(heavy.findById('1')![AllColumns.EstimatedPromille]).toBeLessThan(before);
		expect(p.findById('1')![AllColumns.EstimatedPromille]).toBe(before);
		// Same personal info shares the product objects
		expect(p.subset(p.data).findById('1')).toBe(p.findById('1'));
	});
});

describe('Kaljakori precomputed dataset index', () => {
	const table = () => [
		header as unknown as DatasetRow,
		base('1', { Country: 'Suomi', Description: 'Raikas, Humalainen' }),
		base('2', { Country: 'Saksa', Price: 7, RemovedFromSelection: true }),
		base('3', { Type: '', SubType: '', Country: 'Suomi', Price: 3 })
	];
	const datasetColumns = header.filter(Boolean) as string[];
	const indexFrom = (k: Kaljakori, overrides: Record<string, unknown> = {}) => ({
		version: DATASET_INDEX_VERSION,
		columns: datasetColumns,
		count: k.data.length,
		removedCount: 1,
		possibleValues: Object.fromEntries(datasetColumns.map((c) => [c, [...k.possibleValues[c]]])),
		possibleValuesActive: Object.fromEntries(
			datasetColumns.map((c) => [c, [...k.possibleValuesActive[c]]])
		),
		...overrides
	});

	it('gives the same filter values, types and ranges as computing them', () => {
		const computed = new Kaljakori(table());
		const indexed = new Kaljakori(table(), undefined, undefined, indexFrom(computed));
		expect((indexed as any).datasetIndex).toBeDefined();
		for (const key of indexed.getFilterKeys()) {
			expect(indexed.getFilterType(key)).toBe(computed.getFilterType(key));
			for (const showRemoved of [true, false]) {
				expect(indexed.getFilterValues(key, showRemoved)).toEqual(
					computed.getFilterValues(key, showRemoved)
				);
				expect(indexed.getMinAndMaxValues(key, showRemoved)).toEqual(
					computed.getMinAndMaxValues(key, showRemoved)
				);
			}
		}
	});

	it('uses the precomputed values', () => {
		const computed = new Kaljakori(table());
		const index = indexFrom(computed);
		index.possibleValues[AllColumns.Country] = ['Marker'];
		const indexed = new Kaljakori(table(), undefined, undefined, index);
		expect(indexed.getFilterValues(column(AllColumns.Country))).toEqual(['Marker']);
	});

	it('ignores an index that does not match the dataset', () => {
		const computed = new Kaljakori(table());
		const marked = (overrides: Record<string, unknown>) => {
			const index = indexFrom(computed, overrides);
			index.possibleValues[AllColumns.Country] = ['Marker'];
			return new Kaljakori(table(), undefined, undefined, index).getFilterValues(
				column(AllColumns.Country)
			);
		};
		const expected = ['Saksa', 'Suomi'];
		expect(marked({ count: 99 })).toEqual(expected);
		expect(marked({ removedCount: 0 })).toEqual(expected);
		expect(marked({ columns: datasetColumns.slice(1) })).toEqual(expected);
		expect(marked({ version: 0 })).toEqual(expected);
		expect(marked({ possibleValuesActive: undefined })).toEqual(expected);
		expect(new Kaljakori(table(), undefined, undefined, 'garbage').data).toHaveLength(3);
	});
});

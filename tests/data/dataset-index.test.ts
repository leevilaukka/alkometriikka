import { describe, expect, it, spyOn } from 'bun:test';
import { buildDatasetIndex, withDatasetIndex } from '../../scripts/data/dataset-index';
import { Kaljakori } from '$lib/alko';
import { parseDataset, type StoredProduct } from '$lib/utils/dataset';
import { parseAvailability } from '$lib/utils/availability';
import { AllColumns, DatasetColumns } from '$lib/utils/constants';
import type { DatasetRow } from '$lib/types';

const schema = Object.values(DatasetColumns).filter(
	(column) => column !== DatasetColumns.History && column !== DatasetColumns.RemovedFromSelection
);

function values(fields: Partial<Record<keyof typeof DatasetColumns, unknown>>) {
	const row: unknown[] = Array(schema.length).fill(null);
	for (const [key, value] of Object.entries(fields))
		row[schema.indexOf(DatasetColumns[key as keyof typeof DatasetColumns] as never)] = value;
	return row;
}

function dataset(productCount = 40) {
	const products: Record<string, StoredProduct & { hash: string }> = {};
	for (let i = 0; i < productCount; i++) {
		products[String(1000 + i)] = {
			hash: 'h',
			values: values({
				Number: String(1000 + i),
				Name: `Tuote ${i}`,
				BottleSize: 0.5,
				Price: 2 + i,
				Type: i % 2 ? 'oluet' : 'siiderit',
				Country: i % 3 ? 'Suomi' : 'Ruotsi',
				AlcoholPercentage: 4.7,
				Description: ['Raikas', ' hedelmäinen']
			}),
			priceHistory: [{ date: '2026-09-01', price: 2 + i }],
			...(i === 0 ? { meta: { removedFromSelection: '2026-09-02' } } : {})
		};
	}
	return { schema, metadata: { LastUpdated: '2026-10-01T00:00:00Z' }, products };
}

const kaljakori = (json: string) => {
	const { table, index } = parseDataset(json);
	return new Kaljakori(table as DatasetRow[], undefined, undefined, index);
};

describe('precomputed dataset index', () => {
	it('round-trips through data.json and is used by Kaljakori, with identical results', () => {
		const data = dataset();
		const withIndex = kaljakori(JSON.stringify(withDatasetIndex(data)));
		const without = kaljakori(JSON.stringify(data));
		expect((withIndex as any).datasetIndex).toBeDefined();
		expect((without as any).datasetIndex).toBeUndefined();
		expect(withIndex.data).toEqual(without.data);
		for (const key of without.getFilterKeys()) {
			expect(withIndex.getFilterType(key)).toBe(without.getFilterType(key));
			for (const showRemoved of [true, false]) {
				expect(withIndex.getFilterValues(key, showRemoved)).toEqual(
					without.getFilterValues(key, showRemoved)
				);
				expect(withIndex.getMinAndMaxValues(key, showRemoved)).toEqual(
					without.getMinAndMaxValues(key, showRemoved)
				);
			}
		}
	});

	it('leaves out columns with mostly unique values', () => {
		const index = buildDatasetIndex(dataset());
		expect(Object.keys(index.possibleValues)).toContain(AllColumns.Type);
		expect(Object.keys(index.possibleValues)).toContain(AllColumns.Description);
		expect(Object.keys(index.possibleValues)).not.toContain(AllColumns.Name);
		expect(Object.keys(index.possibleValues)).not.toContain(AllColumns.Number);
		expect(index.count).toBe(40);
		expect(index.removedCount).toBe(1);
	});

	it('replaces a stale index instead of reusing it', () => {
		const data = { ...dataset(), index: { stale: true } as unknown };
		const rebuilt = withDatasetIndex(data);
		expect(rebuilt.index).toEqual(buildDatasetIndex(dataset()));
	});

	it('is ignored by the reader when the products changed after it was built', () => {
		const data = withDatasetIndex(dataset());
		delete data.products['1005'];
		expect((kaljakori(JSON.stringify(data)) as any).datasetIndex).toBeUndefined();
	});

	it('writes the dataset without an index when building one fails', () => {
		const silence = spyOn(console, 'warn').mockImplementation(() => {});
		const broken = withDatasetIndex({ schema: [], products: {} });
		silence.mockRestore();
		expect(broken).toEqual({ schema: [], products: {} });
	});
});

describe('parseAvailability', () => {
	it('drops malformed and hidden stores and malformed product entries', () => {
		const parsed = parseAvailability({
			lastUpdated: '2026-10-01',
			stores: {
				a: { id: 'a', name: 'Alko A' },
				b: { id: 'b', name: 'Alko B', outletType: '2' },
				c: { id: 'c' },
				d: null
			},
			product: { '1': ['a'], '2': 'a', '3': ['a', 7] }
		});
		expect(Object.keys(parsed.stores)).toEqual(['a']);
		expect(parsed.product).toEqual({ '1': ['a'] });
		expect(parsed.lastUpdated).toBe('2026-10-01');
	});

	it('rejects data without stores or products', () => {
		expect(() => parseAvailability(null)).toThrow();
		expect(() => parseAvailability({ stores: {} })).toThrow();
	});
});

import { describe, expect, it, spyOn } from 'bun:test';
import {
	FIELD_TO_LEGACY_SCHEMA,
	HASH_VERSION,
	LEGACY_HEADERS,
	alignValues,
	buildLegacyValues,
	getHash,
	getHashValues
} from '../../scripts/data/constants';
import { carryOverMissingProducts, updatePriceHistory } from '../../scripts/data/lifecycle';
import type { MigratedData, MigratedProduct } from '../../scripts/data/types';
import { DatasetColumns } from '$lib/utils/constants';
import { parseDataset } from '$lib/utils/dataset';

const headers = [...LEGACY_HEADERS];

function row(fields: Partial<Record<(typeof LEGACY_HEADERS)[number], unknown>> = {}): unknown[] {
	const values: unknown[] = Array(headers.length).fill(null);
	for (const [name, value] of Object.entries(fields)) {
		values[headers.indexOf(name as (typeof LEGACY_HEADERS)[number])] = value;
	}
	return values;
}

function product(id: string, extra: Partial<MigratedProduct> = {}): MigratedProduct {
	return {
		hash: `hash-${id}`,
		values: row({ Numero: id, Nimi: `Product ${id}`, Hinta: 5 }),
		priceHistory: [{ date: '2026-09-01', price: 5 }],
		...extra
	};
}

function dataset(products: Record<string, unknown>, overrides: object = {}): string {
	return JSON.stringify({
		schema: LEGACY_HEADERS,
		metadata: { LastUpdated: '2026-10-01T00:00:00Z', LastSynced: '2026-10-01T00:00:00Z' },
		products,
		...overrides
	});
}

describe('schema consistency (writer vs reader)', () => {
	it('the sync schema lists the same columns, in the same order, as the app reads positionally', () => {
		// parseDataset appends History and RemovedFromSelection after the stored columns.
		const { History, RemovedFromSelection, ...stored } = DatasetColumns;
		expect(headers).toEqual(Object.values(stored));
		expect(History).toBe('Hintahistoria');
		expect(RemovedFromSelection).toBe('Poistunut valikoimasta');
	});

	it('every field mapping lines up with its header column', () => {
		expect(FIELD_TO_LEGACY_SCHEMA.map((field) => field.legacyKey)).toEqual(headers);
		expect(buildLegacyValues({ id: '1' })).toHaveLength(headers.length);
	});

	it('Numero is the first column, as parseDataset requires', () => {
		expect(headers[0]).toBe(DatasetColumns.Number);
	});

	it('pins the hashed field set: changing it requires bumping HASH_VERSION', () => {
		// If this fails on purpose, bump HASH_VERSION in scripts/data/constants.ts
		// and run `bun run scripts/data/rehash.ts`, then update the list below.
		const hashed = FIELD_TO_LEGACY_SCHEMA.filter((field) => field.usedForHashing).map(
			(field) => field.legacyKey
		);
		expect(HASH_VERSION).toBe(1);
		expect(hashed).toEqual([
			'Nimi',
			'Hinta',
			'Uutuus',
			'Luonnehdinta',
			'Alkoholi-%',
			'Valikoima',
			'Normaalihinta',
			'Kampanja alkaa',
			'Kampanja päättyy'
		]);
		expect(getHashValues(row())).toHaveLength(hashed.length);
	});

	it('hashes are stable SHA-256 hex strings', () => {
		expect(getHash(['a', 1, null])).toMatch(/^[0-9a-f]{64}$/);
		expect(getHash(['a', 1, null])).toBe(getHash(['a', 1, null]));
	});
});

describe('alignValues', () => {
	it('pads rows from an older, narrower schema with nulls', () => {
		const short = ['1', 'Olut'];
		const aligned = alignValues(short);
		expect(aligned).toHaveLength(headers.length);
		expect(aligned.slice(0, 2)).toEqual(short);
		expect(aligned.slice(2).every((value) => value === null)).toBe(true);
	});

	it('truncates rows from a newer, wider schema and passes exact rows through', () => {
		const exact = row({ Numero: '1' });
		expect(alignValues(exact)).toBe(exact);
		expect(alignValues([...exact, 'extra'])).toEqual(exact);
	});
});

describe('parseDataset', () => {
	it('builds a header row plus one row per product with history and removed flag appended', () => {
		const { table, metadata } = parseDataset(
			dataset({
				'1': product('1'),
				'2': product('2', { meta: { removedFromSelection: '2026-09-30' } })
			})
		);

		expect(table[0]).toEqual([...headers, 'Hintahistoria', 'Poistunut valikoimasta']);
		expect(table).toHaveLength(3);
		const [first, second] = table.slice(1);
		expect(first!.slice(0, headers.length)).toEqual(
			row({ Numero: '1', Nimi: 'Product 1', Hinta: 5 })
		);
		expect(first!.at(-2)).toEqual([{ date: '2026-09-01', price: 5 }]);
		expect(first!.at(-1)).toBe(false);
		expect(second!.at(-1)).toBe(true);
		expect(metadata).toMatchObject({ LastUpdated: '2026-10-01T00:00:00Z' });
	});

	it('skips malformed entries and defaults missing price history', () => {
		const { table } = parseDataset(
			dataset({
				ok: { hash: 'x', values: row({ Numero: 'ok' }) },
				nul: null,
				noValues: { hash: 'x' },
				badValues: { values: 'nope' }
			})
		);
		expect(table).toHaveLength(2);
		expect(table[1]!.at(-2)).toEqual([]);
	});

	it('falls back to the newest price point when metadata is missing', () => {
		const history = [
			{ date: '2026-09-15', price: 6 },
			{ date: '2026-09-01', price: 5 }
		];
		const { metadata } = parseDataset(
			dataset({ '1': product('1', { priceHistory: history }) }, { metadata: undefined })
		);
		expect(metadata).toEqual({ LastUpdated: '2026-09-15' });
	});

	it('prefers the recorded LastUpdated and does not invent LastSynced', () => {
		const { metadata } = parseDataset(
			dataset({ '1': product('1') }, { metadata: { LastUpdated: '2026-10-01T00:00:00Z' } })
		);
		expect(metadata).toEqual({ LastUpdated: '2026-10-01T00:00:00Z' });
	});

	it('rejects datasets with a missing, empty or wrongly-led schema, and with no products', () => {
		const products = { '1': product('1') };
		expect(() => parseDataset(dataset(products, { schema: undefined }))).toThrow();
		expect(() => parseDataset(dataset(products, { schema: [] }))).toThrow();
		expect(() => parseDataset(dataset(products, { schema: ['Nimi', 'Numero'] }))).toThrow();
		expect(() => parseDataset(dataset({}))).toThrow();
		expect(() => parseDataset(dataset({ a: null }))).toThrow();
		expect(() => parseDataset('not json')).toThrow();
	});

	it('tolerates unknown columns from a newer sync with a warning', () => {
		const warn = spyOn(console, 'warn').mockImplementation(() => {});
		const { table } = parseDataset(
			dataset({ '1': product('1') }, { schema: [...headers, 'Uusi sarake'] })
		);
		expect(warn).toHaveBeenCalledWith('Tuntematon sarake datassa: Uusi sarake');
		expect(table[0]).toContain('Uusi sarake');
		warn.mockRestore();
	});
});

describe('sync output → app reader round trip', () => {
	it('a dataset produced by the sync rules parses, keeping removed products', () => {
		const existing = { '1': product('1'), '2': product('2') };
		const products: Record<string, MigratedProduct> = {
			'1': {
				...existing['1'],
				priceHistory: updatePriceHistory(existing['1'].priceHistory, 7, null)
			}
		};
		carryOverMissingProducts(existing, products, new Set(['1']), new Set(), '2026-10-01');

		const output: MigratedData = {
			schema: LEGACY_HEADERS,
			metadata: {
				LastUpdated: '2026-10-01T00:00:00Z',
				LastSynced: '2026-10-01T00:00:00Z',
				HashVersion: HASH_VERSION
			},
			products
		};
		const { table } = parseDataset(JSON.stringify(output));
		const byId = new Map(table.slice(1).map((r) => [r[0], r]));

		expect([...byId.keys()].sort()).toEqual(['1', '2']);
		expect(byId.get('1')!.at(-1)).toBe(false);
		expect((byId.get('1')!.at(-2) as unknown[]).length).toBe(2);
		expect(byId.get('2')!.at(-1)).toBe(true);
		for (const r of byId.values()) expect(r).toHaveLength(headers.length + 2);
	});
});

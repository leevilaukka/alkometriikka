import { describe, expect, it } from 'bun:test';
import { LEGACY_HEADERS } from '../../scripts/data/constants';
import {
	DEFAULT_LIMITS,
	checkSyncSafety,
	isEmptyValue,
	missingCriticalColumns,
	restoreCriticalColumns
} from '../../scripts/data/safeguards';
import type { MigratedProduct } from '../../scripts/data/types';

type Column = (typeof LEGACY_HEADERS)[number];

function values(fields: Partial<Record<Column, unknown>>): unknown[] {
	const row: unknown[] = Array(LEGACY_HEADERS.length).fill(null);
	for (const [name, value] of Object.entries(fields)) {
		row[LEGACY_HEADERS.indexOf(name as Column)] = value;
	}
	return row;
}

const full = (id: string) =>
	values({ Numero: id, Nimi: `Tuote ${id}`, Hinta: 9.99, Tyyppi: 'Oluet', Alue: 'Pohjola' });

function product(id: string, meta?: MigratedProduct['meta']): MigratedProduct {
	return { hash: id, values: full(id), priceHistory: [], ...(meta ? { meta } : {}) };
}

/** A dataset of `n` active products keyed by id. */
function dataset(n: number): Record<string, MigratedProduct> {
	return Object.fromEntries(Array.from({ length: n }, (_, i) => [String(i), product(String(i))]));
}

const healthy = (existing: Record<string, MigratedProduct>) => ({
	existingProducts: existing,
	products: { ...existing },
	rewrites: [],
	apiProducts: Object.keys(existing).length,
	stockedApiProducts: Object.keys(existing).length
});

describe('isEmptyValue', () => {
	it('treats null, blank strings and empty arrays as empty', () => {
		expect([null, undefined, '', '  ', []].every(isEmptyValue)).toBe(true);
		expect([0, false, 'x', ['a']].some(isEmptyValue)).toBe(false);
	});
});

describe('missingCriticalColumns', () => {
	it('lists the core columns a rebuild is missing', () => {
		expect(missingCriticalColumns(full('1'))).toEqual([]);
		expect(missingCriticalColumns(values({ Numero: '1', Hinta: 1 }))).toEqual(['Nimi', 'Tyyppi']);
	});
});

describe('restoreCriticalColumns', () => {
	it('copies blank core fields back from the previous values and keeps the rest', () => {
		const previous = full('1');
		const rebuilt = values({ Numero: '1', Nimi: '', Hinta: 12.5, Tyyppi: 'Oluet' });
		const { values: restored, restored: columns } = restoreCriticalColumns(rebuilt, previous);
		expect(columns).toEqual(['Nimi']);
		expect(restored[LEGACY_HEADERS.indexOf('Nimi')]).toBe('Tuote 1');
		expect(restored[LEGACY_HEADERS.indexOf('Hinta')]).toBe(12.5);
		expect(rebuilt[LEGACY_HEADERS.indexOf('Nimi')]).toBe('');
	});

	it('returns the rebuild as is when nothing is missing', () => {
		const rebuilt = full('2');
		expect(restoreCriticalColumns(rebuilt, full('1'))).toEqual({ values: rebuilt, restored: [] });
	});
});

describe('checkSyncSafety', () => {
	it('accepts an ordinary run', () => {
		expect(checkSyncSafety(healthy(dataset(100)))).toEqual([]);
	});

	it('accepts a first run with no existing dataset', () => {
		expect(
			checkSyncSafety({
				...healthy({}),
				products: dataset(50),
				apiProducts: 50,
				stockedApiProducts: 50
			})
		).toEqual([]);
	});

	it('rejects deleting more products than the cleanup allowance', () => {
		const existing = dataset(100);
		const input = healthy(existing);
		for (let i = 0; i < DEFAULT_LIMITS.maxDroppedProducts; i++) delete input.products[String(i)];
		expect(checkSyncSafety(input)).toEqual([]);
		delete input.products['99'];
		expect(checkSyncSafety(input)[0]).toContain('would be deleted');
	});

	it('rejects flagging a large share of the selection as removed', () => {
		const existing = dataset(100);
		const input = healthy(existing);
		const flag = (n: number) => {
			for (let i = 0; i < n; i++)
				input.products[String(i)] = product(String(i), { removedFromSelection: '2026-10-09' });
		};
		flag(10);
		expect(checkSyncSafety(input)).toEqual([]);
		flag(11);
		expect(checkSyncSafety(input)[0]).toContain('flagged as removed');
	});

	it('ignores products that were already removed before this run', () => {
		const existing = {
			...dataset(10),
			...Object.fromEntries(
				Array.from({ length: 50 }, (_, i) => [
					`old${i}`,
					product(`old${i}`, { removedFromSelection: '2026-01-01' })
				])
			)
		};
		expect(checkSyncSafety(healthy(existing))).toEqual([]);
	});

	it('rejects a run that empties a column for most rewritten products', () => {
		const rewrites = Array.from({ length: 30 }, (_, i) => ({
			previous: full(String(i)),
			values: i < 20 ? values({ Numero: String(i), Nimi: 'x', Hinta: 1, Tyyppi: 'y' }) : full('x')
		}));
		const problems = checkSyncSafety({ ...healthy(dataset(30)), rewrites });
		expect(problems).toHaveLength(1);
		expect(problems[0]).toContain('"Alue" would be emptied for 20/30');
	});

	it('tolerates a few products losing a value, small samples and volatile columns', () => {
		const lose = (count: number, total: number, column: Column) =>
			Array.from({ length: total }, (_, i) => {
				const previous = values({ ...Object.fromEntries([[column, 'x']]), Alue: 'Pohjola' });
				return { previous, values: i < count ? values({ Alue: 'Pohjola' }) : previous };
			});
		const check = (rewrites: ReturnType<typeof lose>) =>
			checkSyncSafety({ ...healthy(dataset(10)), rewrites });
		expect(check(lose(5, 30, 'Alue'))).toEqual([]);
		expect(check(lose(15, 15, 'Rypäleet'))).toEqual([]);
		expect(check(lose(40, 40, 'Kampanja päättyy'))).toEqual([]);
		expect(check(lose(40, 40, 'Uutuus'))).toEqual([]);
	});

	it('rejects a run where most products list no store', () => {
		const input = { ...healthy(dataset(100)), stockedApiProducts: 40 };
		expect(checkSyncSafety(input)[0]).toContain('store availability looks broken');
	});
});

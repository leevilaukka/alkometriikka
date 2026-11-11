import { describe, expect, it } from 'bun:test';
import {
	alcoholMetrics,
	categoryGroups,
	categoryRanks,
	priceHistorySummary,
	sizeVariantGroups,
	type CategoryProduct,
	type VariantProduct
} from '../../scripts/site/product-insights';
import type { CategoryNode } from '../../src/lib/utils/catalog/categories';

describe('alcoholMetrics', () => {
	it('matches the app calculator for a 0.7 l 40 % bottle at 20 €', () => {
		const metrics = alcoholMetrics(0.7, 40, 20)!;
		expect(metrics.grams).toBeCloseTo(220.92, 2);
		expect(metrics.servings).toBeCloseTo(18.41, 2);
		expect(metrics.gramsPerEuro).toBeCloseTo(11.046, 3);
		expect(metrics.pricePerServing).toBeCloseTo(1.086, 3);
	});

	it('returns null for alcohol-free or unpriced products', () => {
		expect(alcoholMetrics(0.33, 0, 2)).toBeNull();
		expect(alcoholMetrics(0.33, 4.7, null)).toBeNull();
		expect(alcoholMetrics(null, 4.7, 2)).toBeNull();
	});
});

describe('priceHistorySummary', () => {
	it('finds the range and the latest change', () => {
		const summary = priceHistorySummary([
			{ date: '2026-07-18', price: 12.58 },
			{ date: '2026-01-26', price: 12.28 },
			{ date: '2026-02-02', price: 12.08 },
			{ date: '2026-09-29', price: 12.69 }
		])!;
		expect(summary.trackedSince).toBe('2026-01-26');
		expect(summary.lowest).toEqual({ price: 12.08, date: '2026-02-02' });
		expect(summary.highest).toEqual({ price: 12.69, date: '2026-09-29' });
		expect(summary.lastChange).toEqual({ date: '2026-09-29', from: 12.58, to: 12.69 });
	});

	it('reports no change for a flat history and null for none', () => {
		expect(
			priceHistorySummary([
				{ date: '2026-01-26', price: 9.99 },
				{ date: '2026-03-01', price: 9.99 }
			])!.lastChange
		).toBeNull();
		expect(priceHistorySummary(undefined)).toBeNull();
		expect(priceHistorySummary([{ date: '2026-01-26', price: 0 }])).toBeNull();
	});
});

describe('categoryRanks', () => {
	const red: CategoryNode = {
		name: 'Punaviinit',
		slug: 'punaviinit',
		path: '/kategoriat/viinit/punaviinit/',
		children: []
	} as unknown as CategoryNode;
	const wines = {
		name: 'Viinit',
		slug: 'viinit',
		path: '/kategoriat/viinit/',
		children: [red]
	} as unknown as CategoryNode;
	const product = (id: string, alcoholPerEuro: number, subTypeSlug = 'punaviinit') =>
		({
			id,
			name: id,
			price: 10,
			alcoholPerEuro,
			typeSlug: 'viinit',
			subTypeSlug
		}) as CategoryProduct;

	it('ranks within the deepest category, best alcohol per euro first, top N only', () => {
		const ranks = categoryRanks(
			categoryGroups(
				[wines],
				[product('a', 1), product('b', 3), product('c', 2), product('d', 9, 'other')]
			),
			2
		);
		expect(ranks.get('b')).toEqual({
			rank: 1,
			total: 3,
			name: 'Punaviinit',
			path: '/kategoriat/viinit/punaviinit/'
		});
		expect(ranks.get('c')?.rank).toBe(2);
		expect(ranks.has('a')).toBe(false);
		// No subtype page of its own, so its type rank is used
		expect(ranks.get('d')).toMatchObject({ rank: 1, total: 4, path: '/kategoriat/viinit/' });
	});
});

describe('sizeVariantGroups', () => {
	const product = (id: string, name: string, volume: number, packaging = 'lasipullo') =>
		({ id, name, volume, packaging }) satisfies VariantProduct;
	const products = [
		product('511897', 'Champagne Brut', 0.75),
		product('903500', 'Champagne Brut', 0.2),
		product('500200', 'Champagne Brut', 0.2),
		product('109156', 'Viina muovipullo', 0.5, 'muovipullo'),
		product('000706', 'Viina', 0.5),
		product('300001', 'Alone', 0.7)
	];
	const matches: Record<string, string[]> = {
		'511897': ['903500', '500200'],
		'903500': ['511897'],
		'500200': ['511897'],
		'109156': ['000706'],
		'000706': ['109156', '999999']
	};
	const groups = sizeVariantGroups(products, (id) => matches[id] ?? []);

	it('merges matches through a shared product into one group with the smallest id', () => {
		const group = groups.get('903500')!;
		expect(group).toBe(groups.get('500200')!);
		expect(group.id).toBe('500200');
		expect(group.members.map((member) => member.id)).toEqual(['500200', '903500', '511897']);
		expect(group.variesBy).toEqual(['size']);
	});

	it('names the group after its shortest name and notes differing packaging', () => {
		const group = groups.get('109156')!;
		expect(group.name).toBe('Viina');
		expect(group.variesBy).toEqual(['size', 'material']);
	});

	it('gives unmatched products no group and ignores matches outside the list', () => {
		expect(groups.has('300001')).toBe(false);
		expect(groups.get('000706')!.members).toHaveLength(2);
	});
});

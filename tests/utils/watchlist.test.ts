import { describe, expect, it, mock } from 'bun:test';
import { writable } from 'svelte/store';
import { AllColumns } from '$lib/utils/constants/columns';
import type { PriceListItem, WatchSnapshot } from '$lib/types';

// The real modules pull in Svelte runes, browser globals and SvelteKit modules.
// Bun shares module mocks between test files, so these match compare.test.ts and templates.test.ts.
mock.module('$lib/global.svelte', () => ({
	compareProductIds: [],
	watchlist: [],
	lists: [],
	isFirefox: writable(false)
}));
mock.module('$lib/utils/app/analytics', () => ({ sendAnalyticsEvent: () => {} }));
const {
	describeWatchChange,
	mergeSnapshot,
	summarizeWatchChanges,
	watchChanges,
	watchSnapshot,
	watchStatuses
} = await import('$lib/utils/user/watchlist');

const product = (id: string, price: number, removed = false) =>
	({
		[AllColumns.Number]: id,
		[AllColumns.Price]: price,
		[AllColumns.RemovedFromSelection]: removed
	}) as unknown as PriceListItem;

const stores = { A: { id: 'A', name: 'Arkadia' }, B: { id: 'B', name: 'Kamppi' } };
const now = new Date('2026-10-21T10:00:00Z');

const snapshot = (fields: Partial<WatchSnapshot>): WatchSnapshot => ({
	at: now.toISOString(),
	price: 10,
	removed: false,
	...fields
});

describe('watch snapshots', () => {
	it('records price, stores and the preferred store', () => {
		const availability = { stores, product: { '1': ['A', 'pickup'] } };
		expect(watchSnapshot(product('1', 12), availability, 'B', now)).toEqual({
			at: now.toISOString(),
			price: 12,
			removed: false,
			stores: 1,
			store: { id: 'B', stocked: false }
		});
	});

	it('leaves stores out while store data is missing', () => {
		const empty = { stores: {}, product: {} };
		expect(watchSnapshot(product('1', 12), empty, 'A', now)).toEqual(snapshot({ price: 12 }));
		expect(watchSnapshot(product('1', 12), null, 'A', now).stores).toBeUndefined();
	});

	it('keeps the stores already seen when merging a snapshot without them', () => {
		const seen = snapshot({ stores: 3, store: { id: 'A', stocked: true } });
		expect(mergeSnapshot(seen, snapshot({ price: 9 }))).toEqual({
			...seen,
			price: 9
		});
	});
});

describe('watch changes', () => {
	it('finds price, selection and stock changes', () => {
		const seen = snapshot({ stores: 0, store: { id: 'A', stocked: false } });
		const later = snapshot({ price: 8, stores: 4, store: { id: 'A', stocked: true } });
		expect(watchChanges(seen, later)).toEqual([
			{ kind: 'price', from: 10, to: 8 },
			{ kind: 'restocked' },
			{ kind: 'in_store', storeId: 'A' }
		]);
		expect(watchChanges(later, snapshot({ removed: true, stores: 0 }))).toEqual([
			{ kind: 'price', from: 8, to: 10 },
			{ kind: 'removed' },
			{ kind: 'sold_out' }
		]);
	});

	it('ignores a different preferred store and missing store data', () => {
		const seen = snapshot({ stores: 2, store: { id: 'A', stocked: false } });
		expect(watchChanges(seen, snapshot({ stores: 2, store: { id: 'B', stocked: true } }))).toEqual(
			[]
		);
		expect(watchChanges(seen, snapshot({}))).toEqual([]);
	});

	it('lists changed products first', () => {
		const items = [
			{ id: '1', addedAt: '2026-10-01', seen: snapshot({}) },
			{ id: '2', addedAt: '2026-10-02', seen: snapshot({}) },
			{ id: '3', addedAt: '2026-10-03', seen: snapshot({}) }
		];
		const products: Record<string, PriceListItem> = { '1': product('1', 7), '2': product('2', 10) };
		const statuses = watchStatuses(items, (id) => products[id], null, undefined);
		expect(statuses.map((status) => [status.item.id, status.changes.length])).toEqual([
			['1', 1],
			['3', 0],
			['2', 0]
		]);
		expect(statuses[1].product).toBeUndefined();
	});
});

describe('watch change labels', () => {
	it('describes changes in Finnish', () => {
		expect(describeWatchChange({ kind: 'price', from: 10, to: 8.5 })).toEqual({
			text: 'Halpeni 10,00 € → 8,50 €',
			good: true
		});
		const name = (id: string) => stores[id as keyof typeof stores]?.name;
		expect(describeWatchChange({ kind: 'in_store', storeId: 'A' }, name).text).toBe(
			'Nyt myymälässä Arkadia'
		);
		expect(describeWatchChange({ kind: 'left_store', storeId: 'X' }).text).toBe(
			'Loppui myymälästäsi'
		);
	});

	it('summarizes counts, biggest first', () => {
		expect(
			summarizeWatchChanges([
				{ kind: 'price', from: 2, to: 1 },
				{ kind: 'in_store', storeId: 'A' },
				{ kind: 'price', from: 3, to: 2 }
			])
		).toBe('2 halpeni, 1 tuli myymälääsi');
	});
});

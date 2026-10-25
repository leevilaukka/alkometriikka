// Watched products: the user follows a product, and the site points out what has
// changed about it since they last looked (price, stores stocking it, their own
// store, leaving or returning to the selection). Everything stays in localStorage.

import { watchlist } from '$lib/global.svelte';
import { intlLocale, m } from '$lib/i18n';
import type { AvailabilityData, PriceListItem, WatchedProduct, WatchSnapshot } from '$lib/types';
import { sendAnalyticsEvent } from '../app/analytics';
import { AllColumns } from '../constants/columns';

export type WatchChange =
	| { kind: 'price'; from: number; to: number }
	| { kind: 'removed' | 'returned' | 'restocked' | 'sold_out' }
	| { kind: 'in_store' | 'left_store'; storeId: string };

/**
 * The product as it is now. `availability` is null until store data has loaded
 * (or when it failed), so a missing load never reads as "sold out everywhere".
 */
export function watchSnapshot(
	product: PriceListItem,
	availability: Pick<AvailabilityData, 'stores' | 'product'> | null,
	preferredStoreId: string | undefined,
	now: Date = new Date()
): WatchSnapshot {
	const snapshot: WatchSnapshot = {
		at: now.toISOString(),
		price: Number(product[AllColumns.Price]),
		removed: Boolean(product[AllColumns.RemovedFromSelection])
	};
	if (availability && Object.keys(availability.stores).length > 0) {
		const storeIds = (availability.product[product[AllColumns.Number]] ?? []).filter(
			(storeId) => storeId in availability.stores
		);
		snapshot.stores = storeIds.length;
		if (preferredStoreId && preferredStoreId in availability.stores)
			snapshot.store = { id: preferredStoreId, stocked: storeIds.includes(preferredStoreId) };
	}
	return snapshot;
}

/** What differs between what the user saw and now. Store changes need store data in both. */
export function watchChanges(seen: WatchSnapshot, now: WatchSnapshot): WatchChange[] {
	const changes: WatchChange[] = [];
	if (Number.isFinite(seen.price) && Number.isFinite(now.price) && seen.price !== now.price)
		changes.push({ kind: 'price', from: seen.price, to: now.price });
	if (seen.removed !== now.removed) changes.push({ kind: now.removed ? 'removed' : 'returned' });
	if (seen.stores !== undefined && now.stores !== undefined) {
		if (seen.stores === 0 && now.stores > 0) changes.push({ kind: 'restocked' });
		if (seen.stores > 0 && now.stores === 0) changes.push({ kind: 'sold_out' });
	}
	// Only within the same store: switching stores isn't a change to the product
	if (seen.store && now.store && seen.store.id === now.store.id) {
		if (!seen.store.stocked && now.store.stocked)
			changes.push({ kind: 'in_store', storeId: now.store.id });
		if (seen.store.stocked && !now.store.stocked)
			changes.push({ kind: 'left_store', storeId: now.store.id });
	}
	return changes;
}

/** `now`, keeping the store fields of `seen` when store data hadn't loaded. */
export function mergeSnapshot(seen: WatchSnapshot, now: WatchSnapshot): WatchSnapshot {
	return { ...now, stores: now.stores ?? seen.stores, store: now.store ?? seen.store };
}

/** Short Finnish label for a change, and whether it's good news for the buyer. */
export function describeWatchChange(
	change: WatchChange,
	storeName?: (id: string) => string | undefined
): { text: string; good: boolean } {
	const euros = (value: number) =>
		value.toLocaleString(intlLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
	switch (change.kind) {
		case 'price':
			return {
				text: (change.to < change.from ? m.watch_price_down : m.watch_price_up)({
					from: euros(change.from),
					to: euros(change.to)
				}),
				good: change.to < change.from
			};
		case 'removed':
			return { text: m.watch_removed(), good: false };
		case 'returned':
			return { text: m.watch_returned(), good: true };
		case 'restocked':
			return { text: m.watch_restocked(), good: true };
		case 'sold_out':
			return { text: m.watch_sold_out(), good: false };
		case 'in_store': {
			const name = storeName?.(change.storeId);
			return { text: name ? m.watch_in_store_named({ name }) : m.watch_in_store(), good: true };
		}
		case 'left_store': {
			const name = storeName?.(change.storeId);
			return {
				text: name ? m.watch_left_store_named({ name }) : m.watch_left_store(),
				good: false
			};
		}
	}
}

/** "2 halpeni, 1 palasi myymälääsi" style summary of all changes, biggest groups first. */
export function summarizeWatchChanges(changes: WatchChange[]): string {
	const counts = new Map<string, number>();
	for (const change of changes) {
		const label =
			change.kind === 'price'
				? change.to < change.from
					? m.watch_sum_cheaper()
					: m.watch_sum_pricier()
				: {
						removed: m.watch_sum_removed(),
						returned: m.watch_sum_returned(),
						restocked: m.watch_sum_restocked(),
						sold_out: m.watch_sum_sold_out(),
						in_store: m.watch_sum_in_store(),
						left_store: m.watch_sum_left_store()
					}[change.kind];
		counts.set(label, (counts.get(label) ?? 0) + 1);
	}
	return [...counts]
		.sort((a, b) => b[1] - a[1])
		.map(([label, count]) => `${count} ${label}`)
		.join(', ');
}

export type WatchStatus = {
	item: WatchedProduct;
	/** Missing when the product is no longer in the dataset at all */
	product?: PriceListItem;
	changes: WatchChange[];
};

/** Every watched product with its changes, changed ones first, newest watched first within each. */
export function watchStatuses(
	items: WatchedProduct[],
	findProduct: (id: string) => PriceListItem | undefined,
	availability: Pick<AvailabilityData, 'stores' | 'product'> | null,
	preferredStoreId: string | undefined
): WatchStatus[] {
	return items
		.map((item) => {
			const product = findProduct(item.id);
			const changes = product
				? watchChanges(item.seen, watchSnapshot(product, availability, preferredStoreId))
				: [];
			return { item, product, changes };
		})
		.sort(
			(a, b) =>
				Number(b.changes.length > 0) - Number(a.changes.length > 0) ||
				b.item.addedAt.localeCompare(a.item.addedAt)
		);
}

export function isWatched(id: string): boolean {
	return watchlist.some((item) => item.id === id);
}

export function watchProduct(id: string, snapshot: WatchSnapshot): void {
	if (isWatched(id)) return;
	watchlist.push({ id, addedAt: snapshot.at, seen: snapshot });
	sendAnalyticsEvent('watch_product', { product_number: id });
}

export function unwatchProduct(id: string): void {
	const index = watchlist.findIndex((item) => item.id === id);
	if (index === -1) return;
	watchlist.splice(index, 1);
	sendAnalyticsEvent('unwatch_product', { product_number: id });
}

/** Records that the user has seen the product as it is now. */
export function markWatchSeen(id: string, snapshot: WatchSnapshot): void {
	const item = watchlist.find((entry) => entry.id === id);
	if (!item) return;
	const seen = mergeSnapshot(item.seen, snapshot);
	// Only on a difference, so opening the product doesn't rewrite storage each time
	const { at: _before, ...before } = item.seen;
	const { at: _after, ...after } = seen;
	if (JSON.stringify(before) !== JSON.stringify(after)) item.seen = seen;
}

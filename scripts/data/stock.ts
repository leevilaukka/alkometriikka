import {
	STOCK_ARRIVAL_DAYS,
	STOCK_HISTORY_DAYS,
	STOCK_RETURN_GAP_DAYS,
	addDays,
	daysBetween,
	stockShard,
	type ProductStockShard,
	type StoreStockFile
} from '../../src/lib/utils/catalog/stock.ts';
import type { AvailabilityData } from './types.ts';

export const STOCK_STATE_VERSION = 1;

/**
 * Everything the stock history needs between runs (`stock/state.json`). Not read
 * by the site, which gets the smaller files from {@link stockFiles}.
 */
export type StockState = {
	version: typeof STOCK_STATE_VERSION;
	/** First day recorded. Arrivals are only recorded once the return gap has passed since. */
	since: string;
	/** Day of each `counts` array's first entry. */
	start: string;
	/** Last day recorded. */
	last: string;
	/** Product → store count per day from `start`. */
	counts: Record<string, (number | null)[]>;
	/** Store → product → last day it was stocked, for products out of the store for less than the return gap. */
	gone: Record<string, Record<string, string>>;
	/** Store → product → day it arrived, for the last {@link STOCK_ARRIVAL_DAYS} days. */
	arrivals: Record<string, Record<string, string>>;
};

type Availability = Pick<AvailabilityData, 'stores' | 'product'>;

export function isStockState(value: unknown): value is StockState {
	if (!value || typeof value !== 'object') return false;
	const state = value as Partial<StockState>;
	return (
		state.version === STOCK_STATE_VERSION &&
		typeof state.since === 'string' &&
		typeof state.start === 'string' &&
		typeof state.last === 'string' &&
		!!state.counts &&
		!!state.gone &&
		!!state.arrivals
	);
}

/** Store → the products it stocks, counting only stores in the store list (pickup points aren't). */
function productsByStore(availability: Availability): Map<string, Set<string>> {
	const byStore = new Map<string, Set<string>>();
	for (const storeId of Object.keys(availability.stores)) byStore.set(storeId, new Set());
	for (const [productId, storeIds] of Object.entries(availability.product)) {
		for (const storeId of storeIds) byStore.get(storeId)?.add(productId);
	}
	return byStore;
}

/**
 * Records `today`'s availability. `previous` is the availability the last run
 * saw: products in a store now but not then are new arrivals there, unless they
 * were gone for less than the return gap. Without it only the counts update.
 * Running again on the same day overwrites that day.
 */
export function updateStockState(
	state: StockState | null,
	previous: Availability | null,
	current: Availability,
	today: string
): StockState {
	const next: StockState = state
		? structuredClone(state)
		: {
				version: STOCK_STATE_VERSION,
				since: today,
				start: today,
				last: today,
				counts: {},
				gone: {},
				arrivals: {}
			};
	// A clock gone backwards would misplace today's counts
	if (today < next.last) return next;

	const currentByStore = productsByStore(current);

	// Counts
	const length = daysBetween(next.start, today) + 1;
	for (const [productId, counts] of Object.entries(next.counts)) {
		while (counts.length < length) counts.push(null);
		// Gone since an earlier run today
		if (!(productId in current.product)) counts[length - 1] = null;
	}
	for (const [productId, storeIds] of Object.entries(current.product)) {
		const counts = (next.counts[productId] ??= Array(length).fill(null));
		counts[length - 1] = storeIds.filter((storeId) => currentByStore.has(storeId)).length;
	}
	if (length > STOCK_HISTORY_DAYS) {
		const drop = length - STOCK_HISTORY_DAYS;
		next.start = addDays(next.start, drop);
		for (const [productId, counts] of Object.entries(next.counts)) {
			counts.splice(0, drop);
			if (counts.every((count) => count === null)) delete next.counts[productId];
		}
	}

	// Arrivals
	if (previous) {
		const previousByStore = productsByStore(previous);
		const recording = today >= addDays(next.since, STOCK_RETURN_GAP_DAYS);
		for (const [storeId, products] of currentByStore) {
			const before = previousByStore.get(storeId);
			// A store new to the list would have its whole selection "arrive"
			if (!before) continue;
			const gone = (next.gone[storeId] ??= {});
			const arrivals = (next.arrivals[storeId] ??= {});
			for (const productId of products) {
				if (before.has(productId)) continue;
				const lastSeen = gone[productId];
				delete gone[productId];
				if (lastSeen && daysBetween(lastSeen, today) < STOCK_RETURN_GAP_DAYS) continue;
				if (recording) arrivals[productId] = today;
			}
			for (const productId of before) {
				if (!products.has(productId)) gone[productId] = today;
			}
		}
	}

	// Stores that closed, and entries too old to matter
	for (const map of [next.gone, next.arrivals]) {
		for (const storeId of Object.keys(map)) {
			if (!currentByStore.has(storeId)) delete map[storeId];
		}
	}
	const goneFrom = addDays(today, -STOCK_RETURN_GAP_DAYS);
	const arrivedFrom = addDays(today, -STOCK_ARRIVAL_DAYS);
	for (const [map, from] of [
		[next.gone, goneFrom],
		[next.arrivals, arrivedFrom]
	] as const) {
		for (const products of Object.values(map)) {
			for (const [productId, date] of Object.entries(products)) {
				if (date < from) delete products[productId];
			}
		}
	}

	next.last = today;
	return next;
}

/** The files the site reads: product counts in 100 shards, and one arrivals file per store. */
export function stockFiles(
	state: StockState,
	current: Availability
): { products: Map<string, ProductStockShard>; stores: Map<string, StoreStockFile> } {
	const products = new Map<string, ProductStockShard>();
	for (const [productId, counts] of Object.entries(state.counts)) {
		const shard = stockShard(productId);
		if (!products.has(shard)) products.set(shard, { start: state.start, counts: {} });
		products.get(shard)!.counts[productId] = counts;
	}

	const stores = new Map<string, StoreStockFile>();
	for (const [storeId, stocked] of productsByStore(current)) {
		const arrivals = Object.entries(state.arrivals[storeId] ?? {})
			// Arrived but sold out since
			.filter(([productId]) => stocked.has(productId))
			.sort(([a, aDate], [b, bDate]) => bDate.localeCompare(aDate) || a.localeCompare(b));
		stores.set(storeId, { since: state.since, arrivals });
	}
	return { products, stores };
}

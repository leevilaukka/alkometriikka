// Stock history: how many stores carried each product on each day, and which
// products recently arrived in each store. Written by scripts/data/stock-history.ts
// under `stock/` next to availability.json (format in docs/data/stock-history.md).

/** Days of per-product store counts kept. */
export const STOCK_HISTORY_DAYS = 90;
/** How long an arrival is listed on the store page. */
export const STOCK_ARRIVAL_DAYS = 30;
/**
 * How long a product must have been gone from a store before coming back counts
 * as arriving there. Shorter gaps are a sold-out shelf being restocked.
 */
export const STOCK_RETURN_GAP_DAYS = 14;

/** `stock/products/<shard>.json`: the products whose number ends in `<shard>`. */
export type ProductStockShard = {
	/** Day of each `counts` array's first entry (Helsinki time, YYYY-MM-DD). */
	start: string;
	/** Store count per day from `start`; null on days the product wasn't in the selection or no sync ran. */
	counts: Record<string, (number | null)[]>;
};

/** `stock/stores/<id>.json` */
export type StoreStockFile = {
	/** First day of the history; arrivals are only recorded from `since` + the return gap on. */
	since: string;
	/** Products that arrived in the last {@link STOCK_ARRIVAL_DAYS} days and are still stocked, newest first. */
	arrivals: [productId: string, date: string][];
};

export type StockPoint = { date: string; count: number };

/** Two-digit shard of a product number ("906458" → "58"). */
export function stockShard(productId: string): string {
	return productId.slice(-2).padStart(2, '0');
}

export function productStockPath(productId: string): string {
	return `stock/products/${stockShard(productId)}.json`;
}

export function storeStockPath(storeId: string): string {
	return `stock/stores/${storeId}.json`;
}

/** "2026-10-21" + 3 → "2026-10-24", in calendar days. */
export function addDays(date: string, days: number): string {
	const [year, month, day] = date.split('-').map(Number);
	return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to`. */
export function daysBetween(from: string, to: string): number {
	return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 864e5);
}

/** A product's recorded days, oldest first, skipping days without a count. */
export function productStockSeries(shard: ProductStockShard, productId: string): StockPoint[] {
	const counts = shard.counts[productId] ?? [];
	const series: StockPoint[] = [];
	counts.forEach((count, index) => {
		if (typeof count === 'number') series.push({ date: addDays(shard.start, index), count });
	});
	return series;
}

export type StockTrend = {
	now: StockPoint;
	/** The oldest point within the window, which may be less than `days` ago while history builds up. */
	before: StockPoint;
	change: number;
};

/** Store count now against `days` ago. Null with fewer than two recorded days. */
export function stockTrend(series: StockPoint[], days = 30): StockTrend | null {
	if (series.length < 2) return null;
	const now = series[series.length - 1];
	const from = addDays(now.date, -days);
	const before = series.find((point) => point.date >= from) ?? series[0];
	if (before === now) return null;
	return { now, before, change: now.count - before.count };
}

function isCounts(value: unknown): value is (number | null)[] {
	return (
		Array.isArray(value) && value.every((count) => count === null || typeof count === 'number')
	);
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseProductStockShard(data: unknown): ProductStockShard | null {
	if (!data || typeof data !== 'object') return null;
	const { start, counts } = data as Record<string, unknown>;
	if (typeof start !== 'string' || !DATE.test(start) || !counts || typeof counts !== 'object')
		return null;
	return {
		start,
		counts: Object.fromEntries(Object.entries(counts).filter(([, value]) => isCounts(value)))
	};
}

export function parseStoreStockFile(data: unknown): StoreStockFile | null {
	if (!data || typeof data !== 'object') return null;
	const { since, arrivals } = data as Record<string, unknown>;
	if (typeof since !== 'string' || !DATE.test(since) || !Array.isArray(arrivals)) return null;
	return {
		since,
		arrivals: arrivals.filter(
			(entry): entry is [string, string] =>
				Array.isArray(entry) &&
				typeof entry[0] === 'string' &&
				typeof entry[1] === 'string' &&
				DATE.test(entry[1])
		)
	};
}

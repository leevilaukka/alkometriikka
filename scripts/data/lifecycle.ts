/**
 * Pure product-lifecycle rules used by the sync (index.ts): price history,
 * removal flagging, detail-verification staleness and search/detail merging.
 * Kept free of I/O so the whole lifecycle can be tested without the Alko API.
 */

import { getSaleInfo } from '../../src/lib/utils/sales.ts';
import type { SaleInfo } from '../../src/lib/utils/sales.ts';
import { LEGACY_HEADERS, isIrrelevantStoredValues } from './constants.ts';
import type {
	DetailedProductData,
	MigratedProduct,
	PricePoint,
	ProductMeta,
	SearchProductData
} from './types.ts';
import { isMigratedProduct } from './guards.ts';

/** Column indices we read back out of a stored `values` array. */
export const NUMERO_INDEX = LEGACY_HEADERS.indexOf('Numero');
export const NIMI_INDEX = LEGACY_HEADERS.indexOf('Nimi');
export const HINTA_INDEX = LEGACY_HEADERS.indexOf('Hinta');
export const NORMAL_PRICE_INDEX = LEGACY_HEADERS.indexOf('Normaalihinta');
export const CAMPAIGN_START_INDEX = LEGACY_HEADERS.indexOf('Kampanja alkaa');
export const CAMPAIGN_END_INDEX = LEGACY_HEADERS.indexOf('Kampanja päättyy');
const NEW_INDEX = LEGACY_HEADERS.indexOf('Uutuus');

const DAY_MS = 24 * 60 * 60 * 1000;

/** Returns a copy of `meta` without the `removedFromSelection` flag, or `undefined` if nothing remains. */
export function withoutRemovedFlag(meta: ProductMeta | undefined): ProductMeta | undefined {
	if (!meta) return undefined;
	const { removedFromSelection, ...rest } = meta;
	return Object.keys(rest).length > 0 ? rest : undefined;
}

/** Clears the `removedFromSelection` flag on a product that is back in the selection. */
export function clearRemovedFlag(product: MigratedProduct): MigratedProduct {
	if (!product.meta?.removedFromSelection) return product;
	const meta = withoutRemovedFlag(product.meta);
	const { meta: _omit, ...rest } = product;
	return meta ? { ...rest, meta } : rest;
}

/**
 * Number of days since the product's last detail verification. Products that
 * have never been verified sort as infinitely stale, so bootstrapping or
 * migrated datasets drain oldest-first across successive runs.
 */
export function detailVerifyAgeDays(product: MigratedProduct): number {
	const checkedAt = product.meta?.detailCheckedAt;
	const timestamp = checkedAt ? Date.parse(checkedAt) : NaN;
	if (Number.isNaN(timestamp)) return Infinity;
	return (Date.now() - timestamp) / DAY_MS;
}

/** True when a product is stale enough to warrant a detail re-verification. */
export function isDetailVerifyCandidate(product: MigratedProduct, cooldownDays: number): boolean {
	return detailVerifyAgeDays(product) > cooldownDays;
}

/**
 * Deep value equality between two `values` cells. Array-shaped fields (such as
 * `taste`/Luonnehdinta) are produced as a fresh array on every build, so a
 * reference comparison would falsely flag identical content as a change.
 */
export function valuesEqual(a: unknown, b: unknown): boolean {
	if (Array.isArray(a) && Array.isArray(b)) {
		if (a.length !== b.length) return false;
		return a.every((item, index) => valuesEqual(item, b[index]));
	}
	return Object.is(a, b);
}

/**
 * Extracts the sale/campaign info stored in a product's legacy `values` array
 * and detects whether the product was on sale at the time the values were
 * captured. Returns `null` when the product is not on sale.
 */
export function salesInfoFromValues(values: unknown[]): SaleInfo | null {
	const item = {
		price: values[HINTA_INDEX],
		normalPrice: values[NORMAL_PRICE_INDEX],
		campaignStart: values[CAMPAIGN_START_INDEX],
		campaignEnd: values[CAMPAIGN_END_INDEX]
	};
	// A campaign that hasn't started yet isn't "active", but the price point
	// recorded now is the only one we get: nothing re-fetches the product when
	// the start date arrives. Evaluate it as of its start date so the campaign
	// window is stored with the point.
	const start = typeof item.campaignStart === 'string' ? item.campaignStart.trim() : '';
	const today = new Date().toISOString().slice(0, 10);
	return getSaleInfo(item, start > today ? start : undefined);
}

/**
 * Appends today's price to the product's history when it differs from the most
 * recent recorded price. Existing history is preserved untouched otherwise.
 *
 * When the product is on sale (`sale` is non-null) the recorded point also
 * carries the reference price and campaign window, so the chart can later show
 * the sale period.
 */
export function updatePriceHistory(
	previous: PricePoint[] | undefined,
	price: number | null,
	sale: SaleInfo | null
): PricePoint[] {
	const history = Array.isArray(previous) ? [...previous] : [];
	if (price === null) return history;

	const last = history[history.length - 1];
	if (!last || last.price !== price) {
		history.push({
			date: new Date().toISOString().slice(0, 10),
			price,
			...(sale
				? {
						normalPrice: sale.normalPrice,
						campaignStart: sale.campaignStart,
						campaignEnd: sale.campaignEnd
					}
				: {})
		});
	}
	return history;
}

/**
 * Merges the search and detail payloads into a single object the schema can
 * read from. Detail-API keys win over search-API keys (see notes), while
 * price/abv/volume remain search-only fields and are preserved.
 *
 * The campaign fields are an exception: the search and detail endpoints report
 * them in different formats, and the search format is the canonical one — the
 * search API returns `lowest_30d_price` as a euro string ("1.1900") and the
 * campaign dates as plain `YYYY-MM-DD`, whereas the detail API returns the
 * price as an integer in cents (179 = 1.79 €) and the dates as ISO timestamps.
 * Keeping the search values protects the normal price from being read as a
 * 100×-too-large reference price and the campaign window from being
 * unparseable.
 */
const SEARCH_WINS_KEYS = ['lowest_30d_price', 'campaign_start_date', 'campaign_end_date'] as const;

export function mergeProduct(
	search: SearchProductData,
	details: DetailedProductData
): Record<string, unknown> {
	const merged: Record<string, unknown> = { ...search, ...details };
	for (const key of SEARCH_WINS_KEYS) {
		if (search[key] != null) merged[key] = search[key];
	}
	return merged;
}

/**
 * Never delete products: carries over every product from the existing dataset
 * that the latest search response no longer contains, flagging it as removed
 * from the selection. A product counts as "removed" purely by its absence from
 * the API's search response. Anything the API still returns is kept active and
 * any stale removed flag is cleared.
 *
 * Only call this after a complete search fetch: the API id set is trusted for
 * removal detection. Mutates `products` (and the `values` of removed entries,
 * to clear the "Uutuus" field) and returns how many products were newly
 * removed and how many irrelevant ones were dropped.
 */
export function carryOverMissingProducts(
	existingProducts: Record<string, unknown>,
	products: Record<string, MigratedProduct>,
	apiIds: ReadonlySet<string>,
	irrelevantIds: ReadonlySet<string>,
	today: string
): { removed: number; filteredRemoved: number } {
	let removed = 0;
	let filteredRemoved = 0;

	for (const [id, previous] of Object.entries(existingProducts)) {
		// Already rebuilt as an active product from the API response this run.
		if (id in products) continue;
		if (!isMigratedProduct(previous)) continue;

		// Drop any existing gifts & drinking accessories: matched by the API's
		// classification (by id) or, for items no longer in the API, by the stored
		// main-group name. These are excluded from the dataset, not "removed".
		if (irrelevantIds.has(id) || isIrrelevantStoredValues(previous.values)) {
			filteredRemoved++;
			continue;
		}

		if (apiIds.has(id)) {
			// Still present in the API response: keep it active, clear any stale flag.
			products[id] = clearRemovedFlag(previous);
		} else if (previous.meta?.removedFromSelection) {
			// Missing from the API and already flagged in an earlier run: keep the
			// original removal date.
			products[id] = previous;
			products[id]['values'][NEW_INDEX] = null; // Clear the "Uutuus" field for removed products
		} else {
			// Present in the existing dataset but absent from the API response: this
			// is a newly removed product, flag it with today's date.
			products[id] = {
				...previous,
				meta: { ...previous.meta, removedFromSelection: today }
			};
			products[id]['values'][NEW_INDEX] = null; // Clear the "Uutuus" field for removed products
			removed++;
		}
	}

	return { removed, filteredRemoved };
}

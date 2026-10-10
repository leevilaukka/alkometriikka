/**
 * Sanity checks the sync (index.ts) runs before writing anything. The fetch
 * guards in index.ts catch an API that is down or returns a partial list; these
 * catch an API that responds "successfully" with something wrong: renamed
 * fields that would blank out values, changed ids or a shrunken list that would
 * flag the selection as removed, or a reclassification that would drop
 * products. When a check fails the sync aborts and leaves the deployed data
 * untouched. Set ALKO_SYNC_FORCE=1 to accept a legitimate large change.
 *
 * Kept free of I/O so the rules can be tested without the Alko API.
 */

import { LEGACY_HEADERS } from './constants.ts';
import { isMigratedProduct } from './guards.ts';
import type { MigratedProduct } from './types.ts';

type Column = (typeof LEGACY_HEADERS)[number];

/** Columns every product must have. A rebuild missing one is never written over good data. */
export const CRITICAL_COLUMNS: readonly Column[] = ['Numero', 'Nimi', 'Hinta', 'Tyyppi'];

/** Columns that legitimately clear for many products at once (campaigns ending, products ageing out of "new"). */
const VOLATILE_COLUMNS: readonly Column[] = [
	'Uutuus',
	'Normaalihinta',
	'Kampanja alkaa',
	'Kampanja päättyy'
];

const CRITICAL_INDICES = CRITICAL_COLUMNS.map((column) => LEGACY_HEADERS.indexOf(column));
const VOLATILE_INDICES = new Set(VOLATILE_COLUMNS.map((column) => LEGACY_HEADERS.indexOf(column)));

export const DEFAULT_LIMITS = {
	/**
	 * Products that may disappear from the dataset in one run. Only the gifts &
	 * accessories cleanup drops products, and that should be near zero by now.
	 */
	maxDroppedProducts: 25,
	/** Share of previously active products that may be newly flagged as removed (biggest real batch so far ~2%). */
	maxRemovedShare: 0.1,
	/** Share of rewritten products that may lose a column's value before the column counts as wiped. */
	maxColumnLossShare: 0.5,
	/** Rewritten products that must have had a column's value before the loss share is judged. */
	minColumnSample: 20,
	/** Share of relevant API products that must be available in at least one store. */
	minStockedShare: 0.5
};

export type SyncLimits = typeof DEFAULT_LIMITS;

export function isEmptyValue(value: unknown): boolean {
	return (
		value === null ||
		value === undefined ||
		(typeof value === 'string' && value.trim() === '') ||
		(Array.isArray(value) && value.length === 0)
	);
}

/** Critical columns empty in `values`. */
export function missingCriticalColumns(values: unknown[]): Column[] {
	return CRITICAL_INDICES.filter((index) => isEmptyValue(values[index])).map(
		(index) => LEGACY_HEADERS[index]
	);
}

/**
 * Copies critical columns the rebuild left empty back from the previous values,
 * so the API blanking e.g. a product's name never erases it while the rest of
 * the update (price, availability, ...) still goes through.
 */
export function restoreCriticalColumns(
	values: unknown[],
	previous: unknown[]
): { values: unknown[]; restored: Column[] } {
	const indices = CRITICAL_INDICES.filter(
		(index) => isEmptyValue(values[index]) && !isEmptyValue(previous[index])
	);
	if (indices.length === 0) return { values, restored: [] };
	const restoredValues = [...values];
	for (const index of indices) restoredValues[index] = previous[index];
	return { values: restoredValues, restored: indices.map((index) => LEGACY_HEADERS[index]) };
}

export type SyncSafetyInput = {
	/** The dataset as it was before this run. */
	existingProducts: Record<string, unknown>;
	/** The dataset about to be written. */
	products: Record<string, MigratedProduct>;
	/** Products whose values were rebuilt from the API this run, with their previous values. */
	rewrites: Array<{ previous: unknown[]; values: unknown[] }>;
	/** Relevant (non-filtered) products in the search response, and how many of them list a store. */
	apiProducts: number;
	stockedApiProducts: number;
};

/** Returns a description of each check that failed; empty when the result is safe to write. */
export function checkSyncSafety(
	{ existingProducts, products, rewrites, apiProducts, stockedApiProducts }: SyncSafetyInput,
	limits: SyncLimits = DEFAULT_LIMITS
): string[] {
	const problems: string[] = [];
	const previous = Object.entries(existingProducts).filter(
		(entry): entry is [string, MigratedProduct] => isMigratedProduct(entry[1])
	);

	const dropped = previous.filter(([id]) => !(id in products)).map(([id]) => id);
	if (dropped.length > limits.maxDroppedProducts) {
		problems.push(
			`${dropped.length} products would be deleted from the dataset (limit ${limits.maxDroppedProducts}), e.g. ${dropped.slice(0, 5).join(', ')}`
		);
	}

	const previouslyActive = previous.filter(([, product]) => !product.meta?.removedFromSelection);
	const newlyRemoved = previouslyActive.filter(
		([id]) => products[id]?.meta?.removedFromSelection
	).length;
	if (
		previouslyActive.length > 0 &&
		newlyRemoved / previouslyActive.length > limits.maxRemovedShare
	) {
		problems.push(
			`${newlyRemoved}/${previouslyActive.length} active products would be flagged as removed from the selection (limit ${limits.maxRemovedShare * 100} %)`
		);
	}

	LEGACY_HEADERS.forEach((column, index) => {
		if (VOLATILE_INDICES.has(index)) return;
		const had = rewrites.filter((rewrite) => !isEmptyValue(rewrite.previous[index]));
		if (had.length < limits.minColumnSample) return;
		const lost = had.filter((rewrite) => isEmptyValue(rewrite.values[index])).length;
		if (lost / had.length > limits.maxColumnLossShare) {
			problems.push(
				`"${column}" would be emptied for ${lost}/${had.length} rewritten products — has the API renamed the field?`
			);
		}
	});

	if (apiProducts > 0 && stockedApiProducts / apiProducts < limits.minStockedShare) {
		problems.push(
			`Only ${stockedApiProducts}/${apiProducts} products list any store (minimum ${limits.minStockedShare * 100} %) — store availability looks broken`
		);
	}

	return problems;
}

// How the user likes to browse the price list: the order and highlight a list opens with, and
// products they never want in it. Everything stays in localStorage, see `browsePrefs` in global.

import type { AvailabilityData, ColumnNames, PriceListItem } from '$lib/types';
import { AllColumns } from '../constants/columns';
import { shownColumnsToHighlight, shownFilters, shownSortingKeys } from '../constants/display';

export type BrowsePrefs = {
	/** Column the product list opens sorted by, empty for the site's own default */
	sort: ColumnNames | '';
	/** Column the product list highlights, empty for the site's own default */
	highlight: ColumnNames | '';
	/** Leave 0 % products out of the product list */
	hideAlcoholFree: boolean;
	/** Product subtypes (Alatyyppi) left out of the product list */
	hiddenSubTypes: string[];
	/** Filters left out of the filter panel (unless one has a value) */
	hiddenFilters: ColumnNames[];
	/** Filters shown first in the filter panel */
	pinnedFilters: ColumnNames[];
};

export function emptyBrowsePrefs(): BrowsePrefs {
	return {
		sort: '',
		highlight: '',
		hideAlcoholFree: false,
		hiddenSubTypes: [],
		hiddenFilters: [],
		pinnedFilters: []
	};
}

function stringList(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return [...new Set(value.filter((item): item is string => typeof item === 'string'))];
}

/** Reads a stored value, dropping anything that isn't a choice the app offers */
export function sanitizeBrowsePrefs(value: unknown): BrowsePrefs {
	const prefs = emptyBrowsePrefs();
	if (typeof value !== 'object' || value === null) return prefs;
	const stored = value as Record<string, unknown>;
	if ((shownSortingKeys as readonly unknown[]).includes(stored.sort))
		prefs.sort = stored.sort as ColumnNames;
	if ((shownColumnsToHighlight as readonly unknown[]).includes(stored.highlight))
		prefs.highlight = stored.highlight as ColumnNames;
	prefs.hideAlcoholFree = stored.hideAlcoholFree === true;
	prefs.hiddenSubTypes = stringList(stored.hiddenSubTypes);
	const offered = shownFilters as readonly string[];
	prefs.hiddenFilters = stringList(stored.hiddenFilters).filter((filter) =>
		offered.includes(filter)
	) as ColumnNames[];
	prefs.pinnedFilters = stringList(stored.pinnedFilters).filter((filter) =>
		offered.includes(filter)
	) as ColumnNames[];
	return prefs;
}

/** The user's column when the list has values for it, otherwise the site's default */
export function preferredColumn(
	preferred: ColumnNames | '',
	fallback: ColumnNames,
	hasValues: (column: ColumnNames) => boolean
): ColumnNames {
	return preferred && hasValues(preferred) ? preferred : fallback;
}

/**
 * Tells which products the product list shows, or undefined when nothing is left out.
 * `storeId` is the store the list is limited to, which needs the store `availability`.
 */
export function productVisibility(
	prefs: BrowsePrefs,
	store?: { id: string; availability: Pick<AvailabilityData, 'product'> }
): ((item: PriceListItem) => boolean) | undefined {
	const hiddenSubTypes = new Set(prefs.hiddenSubTypes);
	if (!prefs.hideAlcoholFree && !hiddenSubTypes.size && !store) return undefined;
	return (item) => {
		if (prefs.hideAlcoholFree && !(Number(item[AllColumns.AlcoholPercentage]) > 0)) return false;
		if (hiddenSubTypes.has(String(item[AllColumns.SubType]))) return false;
		if (store && !(store.availability.product[item[AllColumns.Number]] ?? []).includes(store.id))
			return false;
		return true;
	};
}

/**
 * The filters in the order the panel shows them: pinned ones first, the rest as they were.
 * A hidden filter stays when `keep` says it has a value, so a filter from a shared link
 * can't narrow the list without being seen.
 */
export function arrangeFilters<T extends ColumnNames>(
	filters: readonly T[],
	prefs: Pick<BrowsePrefs, 'hiddenFilters' | 'pinnedFilters'>,
	keep: (filter: T) => boolean
): T[] {
	const hidden = new Set<ColumnNames>(prefs.hiddenFilters);
	const pinned = new Set<ColumnNames>(prefs.pinnedFilters);
	const shown = filters.filter((filter) => !hidden.has(filter) || keep(filter));
	return [
		...shown.filter((filter) => pinned.has(filter)),
		...shown.filter((filter) => !pinned.has(filter))
	];
}

import type { Kaljakori } from '$lib/alko';
import type { ColumnNames, FilterValue, FilterValues, PriceListItem } from '$lib/types';
import { AllColumns, subCategoryMap } from '../constants/columns';
import { getPackCount } from '../constants/badges';
import { shownFilters } from '../constants/display';
export { getComparableProductName } from './productVariants';

export function initFilterValues(
	kaljakori: Kaljakori,
	searchParams?: URLSearchParams,
	showRemoved: boolean = true
) {
	const valuesSearchParams = searchParams
		? filterValuesFromSearchParameters(searchParams, kaljakori)
		: {};
	return [...shownFilters, ...Object.values(subCategoryMap)].reduce(
		(obj, filter) => {
			if (kaljakori.getFilterType(filter) == 'number')
				obj[filter] =
					valuesSearchParams[filter as keyof typeof valuesSearchParams] ??
					kaljakori.getMinAndMaxValues(filter, showRemoved);
			else if (kaljakori.getFilterType(filter) == 'string')
				obj[filter] = valuesSearchParams[filter as keyof typeof valuesSearchParams] || [];
			else if (kaljakori.getFilterType(filter) == 'object')
				obj[filter] = valuesSearchParams[filter as keyof typeof valuesSearchParams] || [];
			return obj;
		},
		{} as Record<ColumnNames, FilterValue>
	);
}

/**
 * Returns the sub filter shown nested under `filter`, if any. Sub filters that are
 * also shown on their own (e.g. Alatyyppi under Tyyppi) aren't nested.
 */
export function getNestedSubFilter(filter: ColumnNames): ColumnNames | undefined {
	const child = subCategoryMap[filter as keyof typeof subCategoryMap];
	if (!child || (shownFilters as readonly ColumnNames[]).includes(child)) return undefined;
	return child;
}

/**
 * Returns the parent of `filter` when both are shown on their own (e.g. Tyyppi for
 * Alatyyppi), in which case the parent narrows the options of `filter`.
 */
export function getShownParentFilter(filter: ColumnNames): ColumnNames | undefined {
	const shown = shownFilters as readonly ColumnNames[];
	if (!shown.includes(filter)) return undefined;
	const parent = (Object.keys(subCategoryMap) as (keyof typeof subCategoryMap)[]).find(
		(key) => subCategoryMap[key] === filter
	);
	return parent && shown.includes(parent) ? parent : undefined;
}

/**
 * Values of `filter` limited to those matching the selections of its shown parent filter.
 */
export function getNarrowedFilterValues(
	filter: ColumnNames,
	filterValues: FilterValues,
	kaljakori: Kaljakori,
	showRemoved: boolean = true
) {
	const values = kaljakori.getFilterValues(filter, showRemoved);
	const parent = getShownParentFilter(filter);
	const parentValue = parent && filterValues[parent];
	if (!parent || !Array.isArray(parentValue) || !parentValue.length) return values;
	const allowed = new Set<string | number>(
		kaljakori.getSubFilterValues(parent, { [parent]: parentValue } as FilterValues, showRemoved)
	);
	return values.filter((value) => allowed.has(value));
}

export function searchParametersFromFilterValues(
	filterValues: FilterValues,
	kaljakori: Kaljakori,
	showRemoved: boolean = true
) {
	return Object.entries(filterValues).reduce<Record<string, string | string[]>>(
		(obj, [key, value]) => {
			const type = kaljakori.getFilterType(key as ColumnNames);
			if (type === 'string' && Array.isArray(value)) {
				obj[key] = value as string[];
			} else if (type === 'object') {
				obj[key] = Array.from(value) as string[];
			} else if (type === 'number' && Array.isArray(value)) {
				const defaults = kaljakori.getMinAndMaxValues(key as ColumnNames, showRemoved);
				if (defaults && defaults[0] == value[0] && defaults[1] == value[1]) obj[key] = '';
				else obj[key] = `${value[0]}-${value[1]}`;
			}
			return obj;
		},
		{}
	);
}

/**
 * Whether the URL gets a filter's selections as one comma-separated value (`?Tyyppi=Oluet,Siiderit`)
 * instead of repeated keys (`?Tyyppi=Oluet&Tyyppi=Siiderit`). Both forms are read either way.
 */
export const COMMA_SEPARATED_FILTERS = false;

/**
 * Joins each filter's selections into one comma-separated value. A filter with a selection that
 * contains a comma itself (`Brandyt, armanjakit ja calvadosit`) keeps the repeated form.
 */
export function joinFilterParams(params: Record<string, string | string[]>) {
	return Object.fromEntries(
		Object.entries(params).map(([key, value]) => [
			key,
			Array.isArray(value) && !value.some((v) => v.includes(',')) ? value.join(',') : value
		])
	);
}

/**
 * Reads filters in either URL form: repeated keys (`?Tyyppi=Oluet&Tyyppi=Siiderit`) or
 * comma-separated (`?Tyyppi=Oluet,Siiderit`), whichever {@link COMMA_SEPARATED_FILTERS} picks for
 * writing. A value that is one of the filter's own values is kept whole, so selections containing
 * commas (`Brandyt, armanjakit ja calvadosit`) survive either way.
 */
export function filterValuesFromSearchParameters(
	searchParams: URLSearchParams,
	kaljakori: Kaljakori
) {
	return [...new Set(searchParams.keys())].reduce((obj, key) => {
		const type = kaljakori.getFilterType(key as ColumnNames);
		if (type === 'number')
			return {
				...obj,
				[key]: searchParams
					.get(key)
					?.split('-')
					.map((v) => Number(v))
			};
		const values = searchParams.getAll(key);
		if (type !== 'string' && type !== 'object') return { ...obj, [key]: values };
		const known = new Set(kaljakori.getFilterValues(key as ColumnNames));
		return {
			...obj,
			[key]: values.flatMap((value) =>
				known.has(value)
					? [value]
					: value
							.split(',')
							.map((v) => v.trim())
							.filter(Boolean)
			)
		};
	}, {});
}

export function generateSimilarProductsFilter(
	product: PriceListItem,
	restrictions: Partial<Record<ColumnNames, string[] | number | string>>
): FilterValues {
	return Object.fromEntries(
		Object.entries(restrictions).map(([key, value]) => {
			if (
				typeof value === 'number' &&
				typeof product[key] === 'number' &&
				Object.hasOwn(product, key)
			)
				return [key, [product[key] - product[key] * value, product[key] + product[key] * value]];
			return [key, value];
		})
	);
}

/** Columns the product page and the similar-products page score similarity on. */
export const SIMILAR_PRODUCT_COLUMNS: ReadonlySet<ColumnNames> = new Set([
	AllColumns.Type,
	AllColumns.SubType,
	AllColumns.BeerType,
	AllColumns.Price,
	AllColumns.BottleSize,
	AllColumns.Sugar,
	AllColumns.PackagingType,
	AllColumns.AlcoholGramsPerEuro,
	AllColumns.GrapeVarieties,
	AllColumns.Description
]);

export function findSimilarProducts(
	product: PriceListItem,
	kaljakori: Kaljakori,
	restrictions: ReadonlySet<ColumnNames>,
	limit: number
): PriceListItem[] {
	const scored = kaljakori.data.map((item) => {
		let score = 0;

		restrictions.forEach((key) => {
			const valueType = kaljakori.getFilterType(key);
			if (
				valueType === 'number' &&
				typeof product[key] === 'number' &&
				typeof item[key] === 'number'
			) {
				const diff = Math.abs(product[key] - item[key]);
				const range = Math.max(product[key] * 0.2, 0.01); // 20% range or at least 0.01 to avoid division by zero
				score += Math.max(0, 1 - diff / range); // Linear scoring within range
			} else if (valueType === 'string') {
				if (product[key] === item[key]) score += 1;
			}
		});

		const multiplierColumnsAndWeights = {
			[AllColumns.GrapeVarieties]: 1,
			[AllColumns.Description]: 1
		} as const;

		Object.keys(multiplierColumnsAndWeights).forEach((column) => {
			if (
				restrictions.has(column as keyof typeof multiplierColumnsAndWeights) &&
				product[column] instanceof Set &&
				item[column] instanceof Set
			) {
				let multiplier = 1;
				const productValues = product[column];
				const itemValues = item[column];
				let commonValuesCount = 0;
				for (const value of productValues) if (itemValues.has(value)) commonValuesCount++;
				multiplier += commonValuesCount / (Math.max(productValues.size, itemValues.size) || 1);
				multiplier +=
					multiplier *
					multiplierColumnsAndWeights[column as keyof typeof multiplierColumnsAndWeights];
				score *= multiplier;
			}
		});

		return { item, score };
	});
	scored.sort((a, b) => b.score - a.score);
	return scored
		.filter(({ item }) => item[AllColumns.Number] !== product[AllColumns.Number])
		.slice(0, limit)
		.map(({ item }) => item);
}

export type SizeOption = {
	product: PriceListItem;
	isCurrent: boolean;
	isBestValue: boolean;
	barPercent: number;
	packCount: number;
};

/**
 * Builds the sorted (by BottleSize asc) size-comparison list for the
 * "Pakkauskoko" size selector, including `product` itself alongside the
 * other pack sizes found by {@link findDifferentSizeOfProduct} that are
 * still in the selection.
 */
export function buildSizeOptions(product: PriceListItem, kaljakori: Kaljakori): SizeOption[] {
	const byId = new Map<string, PriceListItem>();
	byId.set(product[AllColumns.Number], product);
	for (const item of findDifferentSizeOfProduct(product, kaljakori)) {
		// Removed sizes can't be bought, so they must not be offered (or flagged as the best value)
		if (item[AllColumns.RemovedFromSelection]) continue;
		byId.set(item[AllColumns.Number], item);
	}
	const all = [...byId.values()].sort(
		(a, b) =>
			getPackCount(a) - getPackCount(b) ||
			a[AllColumns.BottleSize] - b[AllColumns.BottleSize] ||
			a[AllColumns.Price] - b[AllColumns.Price]
	);
	const prices = all.map((item) => item[AllColumns.PricePerLiter]);
	const min = Math.min(...prices);
	const max = Math.max(...prices);
	return all.map((item) => {
		const pricePerLiter = item[AllColumns.PricePerLiter];
		const barPercent =
			max === min ? 100 : Math.round((1 - (pricePerLiter - min) / (max - min)) * 100);
		return {
			product: item,
			isCurrent: item[AllColumns.Number] === product[AllColumns.Number],
			isBestValue: pricePerLiter === min,
			barPercent,
			packCount: getPackCount(item)
		};
	});
}

export function findDifferentSizeOfProduct(
	product: PriceListItem,
	kaljakori: Kaljakori
): PriceListItem[] {
	return kaljakori.findDifferentSizesOfProduct(product);
}

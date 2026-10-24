import {
	AllColumns,
	CalculatedColumns,
	subCategoryMap,
	undefinedToZeroColumns,
	MissingValues,
	DrunkColumns,
	StoreColumns,
	columnsHandledAsString,
	columnsHandledAsSet
} from '$lib/utils/constants/columns';
import { defaultSortingColumn } from '$lib/utils/constants/display';
import { GenderOptionsMap } from '$lib/utils/constants/app';
import { calculateDrunkValue, calculatePricePerLitre } from '../utils/catalog/alko';
import {
	type ColumnNames,
	type DatasetColumnNames,
	type DatasetRow,
	type ColumnType,
	type PersonalInfo,
	type PriceListItem,
	type FilterValues,
	type AvailabilityData
} from '../types';
import { isSimilarString } from '$lib/utils/catalog/search';
import { getSaleInfo } from '../utils/catalog/sales';
import { ProductVariantIndex } from '../utils/catalog/productVariants';
import { buildCategoryTree, type CategoryNode } from '../utils/catalog/categories';
import { createSubscriber } from 'svelte/reactivity';

function toPositiveNumber(value: unknown): number | null {
	if (typeof value === 'number') {
		return Number.isFinite(value) && value > 0 ? value : null;
	}

	if (typeof value !== 'string') return null;
	const normalized = value
		.replace(/\s/g, '')
		.replace(/,/g, '.')
		.replace(/[^\d.\-]/g, '');

	const parsed = Number(normalized);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function resolveBottleSize(
	row: DatasetRow,
	datasetColumnIndexes: Record<DatasetColumnNames, number>
): number {
	const rawBottleSize = toPositiveNumber(row[datasetColumnIndexes[AllColumns.BottleSize]]);
	if (rawBottleSize) return rawBottleSize;

	const price = toPositiveNumber(row[datasetColumnIndexes[AllColumns.Price]]);
	const pricePerLiter = toPositiveNumber(row[datasetColumnIndexes[AllColumns.PricePerLiter]]);
	if (price && pricePerLiter) {
		const inferred = Number((price / pricePerLiter).toFixed(3));
		if (inferred >= 0.05 && inferred <= 30) return inferred;
	}

	return 1;
}

/**
 * Filter values precomputed by the sync (see scripts/data/dataset-index.ts) and
 * stored in data.json as `index`. Covers only the dataset columns: drunk values
 * depend on personal info, store availability on availability.json and the sale
 * flag on today's date, so those are always computed in the browser.
 */
export type DatasetIndex = {
	version: typeof DATASET_INDEX_VERSION;
	/** The parsed table header the index was built for. */
	columns: string[];
	/** Products Kaljakori keeps after skipping invalid rows, and how many of them are removed. */
	count: number;
	removedCount: number;
	/**
	 * Sorted unique values per dataset column, with and without removed products.
	 * Only low-cardinality columns are included; the rest (names, ids, prices)
	 * would mostly duplicate the products, so they're computed in the browser.
	 */
	possibleValues: Record<string, (string | number)[]>;
	possibleValuesActive: Record<string, (string | number)[]>;
};

export const DATASET_INDEX_VERSION = 1;

type ValueIndex = {
	possibleValues: Record<string, Set<any>>;
	possibleValuesActive: Record<string, Set<any>>;
	columnTypes: Record<string, ColumnType>;
	minAndMaxValues: ([number, number] | null)[];
	minAndMaxValuesActive: ([number, number] | null)[];
};

const NUMBER_VALUE_REGEX = /^(?:0|[1-9]\d*)(?:\.\d+)?(?:\s*l)?$/;
const isNumber = (value: any) => NUMBER_VALUE_REGEX.test(String(value));

/** Capitalizes the first character. Only the first code point is lowercased before
 * upper-casing it, which gives the same result as lowercasing the whole string. */
function toFormattedStringValue(value: string) {
	const trimmed = value.trim();
	const first = trimmed.length
		? String.fromCodePoint(trimmed.codePointAt(0)!).toLowerCase().charAt(0).toUpperCase()
		: '';
	return first + value.slice(1);
}

/** Adds a column value to a possible-values bucket: numbers, non-empty strings and set members. */
function collectValue(bucket: Set<any>, value: unknown) {
	if (typeof value === 'number' || (typeof value === 'string' && value.length)) bucket.add(value);
	else if (value instanceof Set) for (const member of value) bucket.add(member);
}

function sortedSet(values: Iterable<any>) {
	return new Set([...values].sort());
}

function minAndMax(values: Set<any>): [number, number] {
	let min = Infinity;
	let max = -Infinity;
	for (const value of values) {
		min = Math.min(min, value);
		max = Math.max(max, value);
	}
	return [min, max];
}

/** Queries shorter than this only match values that contain them, without typo tolerance. */
const MIN_FUZZY_QUERY_LENGTH = 4;

const drunkColumns = Object.values(DrunkColumns);
const storeColumns = Object.values(StoreColumns);
const calculatedColumns = Object.values(CalculatedColumns);

function isDatasetIndex(value: unknown): value is DatasetIndex {
	const index = value as DatasetIndex | null;
	return (
		!!index &&
		typeof index === 'object' &&
		index.version === DATASET_INDEX_VERSION &&
		Array.isArray(index.columns) &&
		typeof index.count === 'number' &&
		typeof index.removedCount === 'number' &&
		!!index.possibleValues &&
		typeof index.possibleValues === 'object' &&
		!!index.possibleValuesActive &&
		typeof index.possibleValuesActive === 'object'
	);
}

/** How each dataset column is parsed, resolved once instead of per cell */
const Kind = { History: 0, Removed: 1, String: 2, Set: 3, Other: 4, OtherZero: 5 } as const;

const isMissing = (value: unknown) => value === null || value === undefined || value === '';

export class Kaljakori {
	private items: PriceListItem[] = [];
	personalInfo: PersonalInfo;
	filters: ColumnNames[] = [];
	private datasetColumns: DatasetColumnNames[] = [];
	private declaredBottleSizes = new Set<PriceListItem>();
	/** The gender and weight the drunk values in `data` were computed with. */
	private drunkBasis: Pick<PersonalInfo, 'gender' | 'weight'>;
	private datasetIndex: DatasetIndex | undefined;
	/** The index passed in, kept to check again once products are added */
	private datasetIndexCandidate: unknown;
	/** Whether `datasetIndex` covers the removed products too, or only the selection is loaded */
	private datasetIndexComplete = false;
	private columnKinds: (typeof Kind)[keyof typeof Kind][] = [];
	private datasetColumnIndexes = {} as Record<DatasetColumnNames, number>;
	private valueIndex: ValueIndex | undefined;
	private productVariants: ProductVariantIndex | undefined;
	private categoryTree: CategoryNode[] | undefined;
	private subValuesCache: Record<string, Record<string, Set<any>>> | undefined;
	/** The Kaljakori this one is a subset of, or itself. Owns the store availability. */
	private root: Kaljakori = this;
	// Store availability and removed products can arrive after construction (see
	// setAvailability and addProducts); this lets Svelte effects and deriveds that
	// read the products re-run when they do.
	private availabilityVersion = 0;
	private hasAvailability = false;
	private valueIndexVersion = 0;
	private changeUpdate: (() => void) | undefined;
	private readonly changeSubscriber = createSubscriber((update) => {
		this.changeUpdate = update;
		return () => (this.changeUpdate = undefined);
	});

	/**
	 * @param table Header row plus dataset rows, as produced by `parseDataset`.
	 * @param availability Store availability. Can also be supplied later with `setAvailability`.
	 * @param index Filter values precomputed by the sync. Ignored unless it matches this table.
	 */
	constructor(
		table: DatasetRow[],
		personalInfo?: PersonalInfo,
		availability?: AvailabilityData,
		index?: unknown
	) {
		this.personalInfo = personalInfo || { weight: null, gender: GenderOptionsMap.Unspecified };
		// Normalized the way calculateDrunkValue reads them, so equal inputs compare equal
		this.drunkBasis = {
			gender: personalInfo?.gender ?? GenderOptionsMap.Unspecified,
			weight: personalInfo?.weight || null
		};

		const [datasetColumns, ...rows] = table as [DatasetColumnNames[], ...DatasetRow[]];
		this.datasetColumns = datasetColumns;
		this.filters = [...datasetColumns, ...drunkColumns, ...storeColumns, ...calculatedColumns];

		this.datasetColumnIndexes = Object.fromEntries(
			datasetColumns.map((column, idx) => [column, idx])
		) as Record<DatasetColumnNames, number>;
		this.columnKinds = datasetColumns.map((key) => {
			if (key === AllColumns.History) return Kind.History;
			if (key === AllColumns.RemovedFromSelection) return Kind.Removed;
			if (columnsHandledAsString.includes(key as (typeof columnsHandledAsString)[number]))
				return Kind.String;
			if (columnsHandledAsSet.includes(key as (typeof columnsHandledAsSet)[number]))
				return Kind.Set;
			if (undefinedToZeroColumns.includes(key as any)) return Kind.OtherZero;
			return Kind.Other;
		});

		for (const values of rows) {
			const item = this.parseRow(values);
			if (item) this.items.push(item);
		}

		this.datasetIndexCandidate = index;
		this.checkDatasetIndex();

		if (availability) {
			this.applyAvailability(availability);
			this.hasAvailability = true;
		}

		this.items = this.sortBy(defaultSortingColumn);
	}

	/**
	 * Every product, or a subset's products. Reading it in a Svelte effect or derived re-runs
	 * it when products are added.
	 */
	get data(): PriceListItem[] {
		this.trackChanges();
		return this.items;
	}

	set data(items: PriceListItem[]) {
		this.items = items;
	}

	/** A dataset row as a product, or null for accessories and rows without an ABV or a price. */
	private parseRow(values: DatasetRow): PriceListItem | null {
		const datasetColumns = this.datasetColumns;
		const datasetColumnIndexes = this.datasetColumnIndexes;
		const kinds = this.columnKinds;
		const bottleSizeIndex = datasetColumnIndexes[AllColumns.BottleSize];

		// Skip accessories ('lahja- ja juomatarvikkeet') and rows without an ABV or a price
		if (values[datasetColumnIndexes[AllColumns.Availability]] === 'tarvikevalikoima') return null;
		if (
			isMissing(values[datasetColumnIndexes[AllColumns.AlcoholPercentage]]) ||
			isMissing(values[datasetColumnIndexes[AllColumns.Price]])
		)
			return null;

		const item: any = {};

		// Inferred sizes remain useful for display/calculations, but cannot prove
		// that two products are different packages of the same drink.
		const rawBottleSize = values[bottleSizeIndex];
		if (
			/^\d+(?:[.,]\d+)?(?:\s*l)?$/i.test(String(rawBottleSize).trim()) &&
			toPositiveNumber(rawBottleSize) !== null
		) {
			this.declaredBottleSizes.add(item);
		}
		values[bottleSizeIndex] = resolveBottleSize(values, datasetColumnIndexes);

		for (let col = 0; col < datasetColumns.length; col++) {
			const value: unknown = values[col];
			switch (kinds[col]) {
				case Kind.History:
					item[datasetColumns[col]] = Array.isArray(value) ? value : [];
					break;
				case Kind.Removed:
					item[datasetColumns[col]] = Boolean(value);
					break;
				case Kind.String:
					item[datasetColumns[col]] = toFormattedStringValue(String(value));
					break;
				case Kind.Set:
					item[datasetColumns[col]] = new Set(
						String(value || '')
							.split(/[\.,]\s/)
							.map((v) => toFormattedStringValue(v.trim()))
							.filter((v) => v.length > 0)
					);
					break;
				default:
					if (isNumber(value)) item[datasetColumns[col]] = Number.parseFloat(String(value));
					else if (typeof value === 'string')
						item[datasetColumns[col]] = toFormattedStringValue(value);
					else if (kinds[col] === Kind.OtherZero) {
						item[datasetColumns[col]] = 0;
						(item[MissingValues] ??= new Set()).add(datasetColumns[col]);
					} else item[datasetColumns[col]] = '';
			}
		}

		// Alko leaves the litre price out until a product is on sale. Only fill it in
		// from a real size: an inferred one would make up a number.
		if (item[AllColumns.PricePerLiter] === '' && this.declaredBottleSizes.has(item)) {
			const perLitre = calculatePricePerLitre(
				item[AllColumns.Price],
				item[AllColumns.BottleSize],
				item[AllColumns.Deposit]
			);
			if (perLitre !== null) {
				item[AllColumns.PricePerLiter] = perLitre;
				(item[MissingValues] ??= new Set()).add(AllColumns.PricePerLiter);
			}
		}

		for (const column of calculatedColumns) {
			if (column === AllColumns.OnSale) {
				const sale = getSaleInfo({
					price: item[AllColumns.Price],
					normalPrice: item[AllColumns.NormalPrice],
					campaignStart: item[AllColumns.CampaignStart],
					campaignEnd: item[AllColumns.CampaignEnd]
				});
				item[column] = sale ? 'alennuksessa' : '';
			} else {
				item[column] = '';
			}
		}

		Object.assign(item, this.computeDrunkValues(item, this.drunkBasis));

		// Filled in by setAvailability from availability.json's productId -> storeId[] map
		item[AllColumns.StoreAvailability] = new Set<string>();

		// Fill "Tyyppi" with "Ei määritelty" if empty
		if (!item[AllColumns.Type]) item[AllColumns.Type] = 'Ei määritelty';
		// Fill "Alatyyppi" with "Oluttyyppi" or "Tyyppi" if empty
		if (!item[AllColumns.SubType])
			item[AllColumns.SubType] = item[AllColumns.BeerType] || item[AllColumns.Type];

		return item;
	}

	/**
	 * Uses the precomputed index if it was built for these columns and products. It is built
	 * over every product, so it also fits while only the selection is loaded, with the
	 * selection's values standing in for all of them until the removed products are added.
	 */
	private checkDatasetIndex() {
		const index = this.datasetIndexCandidate;
		this.datasetIndex = undefined;
		if (!isDatasetIndex(index)) return;
		const columns = this.datasetColumns;
		const removed = this.items.filter((item) => item[AllColumns.RemovedFromSelection]).length;
		const valid =
			index.columns.length === columns.length &&
			index.columns.every((column, idx) => column === columns[idx]) &&
			index.count - index.removedCount === this.items.length - removed &&
			(removed === index.removedCount || removed === 0);
		if (!valid) return;
		this.datasetIndex = index;
		this.datasetIndexComplete = removed === index.removedCount;
	}

	/**
	 * Adds products that load after the rest, the removed ones from data-removed.json. Products
	 * already here are skipped. Svelte effects and deriveds reading `data` re-run; subsets made
	 * before keep their products.
	 */
	addProducts(rows: DatasetRow[]) {
		const known = new Set(this.items.map((item) => item[AllColumns.Number]));
		const added: PriceListItem[] = [];
		for (const values of rows) {
			const item = this.parseRow(values);
			if (item && !known.has(item[AllColumns.Number])) added.push(item);
		}
		if (!added.length) return;

		// A new array, so deriveds that compare it by reference see the change
		this.items = [...this.items, ...added];
		this.checkDatasetIndex();
		this.valueIndex = undefined;
		this.productVariants = undefined;
		this.categoryTree = undefined;
		this.subValuesCache = undefined;
		this.items = this.sortBy(defaultSortingColumn);
		this.changeUpdate?.();
	}

	private computeDrunkValues(item: any, info: Pick<PersonalInfo, 'gender' | 'weight'>) {
		return calculateDrunkValue(
			item[AllColumns.BottleSize],
			item[AllColumns.AlcoholPercentage],
			item[AllColumns.Price],
			info.gender ?? undefined,
			info.weight ?? undefined
		);
	}

	private applyAvailability(availability: AvailabilityData) {
		const storeNameById = new Map(
			Object.entries(availability.stores ?? {}).map(([id, store]) => [id, store.name])
		);
		for (const item of this.data) {
			// Updated in place, so subsets with copies of the product see it too
			const names = item[AllColumns.StoreAvailability];
			names.clear();
			for (const storeId of availability.product?.[item[AllColumns.Number]] ?? []) {
				const name = storeNameById.get(storeId);
				if (name) names.add(name);
			}
		}
	}

	/**
	 * Resolves the stores each product is available in. availability.json loads
	 * after the price list, so the store filter fills in once this runs. Subsets
	 * made earlier pick it up too.
	 */
	setAvailability(availability: AvailabilityData) {
		this.applyAvailability(availability);
		this.hasAvailability = true;
		this.availabilityVersion++;
		this.changeUpdate?.();
	}

	/**
	 * Whether store availability has been applied yet (also when it failed to load
	 * and came back empty). Reactive in Svelte effects, deriveds and templates.
	 */
	get availabilityLoaded(): boolean {
		this.trackChanges();
		return this.root.hasAvailability;
	}

	/** Makes the calling Svelte effect or derived re-run when store availability or the products change. */
	private trackChanges() {
		this.root.changeSubscriber();
	}

	/**
	 * A Kaljakori of some of this one's products (e.g. a category or a list) whose
	 * filter values, column types and ranges cover just those products. Drunk
	 * values are recomputed if `personalInfo` has changed since this one was built.
	 */
	subset(items: PriceListItem[], personalInfo: PersonalInfo = this.personalInfo): Kaljakori {
		const subset = new Kaljakori([this.datasetColumns as unknown as DatasetRow], personalInfo);
		subset.root = this.root;
		const basis = subset.drunkBasis;
		if (basis.gender === this.drunkBasis.gender && basis.weight === this.drunkBasis.weight) {
			subset.data = [...items];
			subset.declaredBottleSizes = this.declaredBottleSizes;
		} else {
			subset.data = items.map((item) => {
				const copy = { ...item, ...this.computeDrunkValues(item, basis) } as PriceListItem;
				if (this.declaredBottleSizes.has(item)) subset.declaredBottleSizes.add(copy);
				return copy;
			});
		}
		subset.data = subset.sortBy(defaultSortingColumn);
		return subset;
	}

	/** Possible filter values, types and ranges, computed on first use. */
	private getValueIndex(): ValueIndex {
		const version = this.root.availabilityVersion;
		if (this.valueIndex && this.valueIndexVersion !== version) {
			this.valueIndexVersion = version;
			const column = AllColumns.StoreAvailability;
			const active = new Set<any>();
			const removed = new Set<any>();
			for (const item of this.data)
				collectValue(
					item[AllColumns.RemovedFromSelection] === true ? removed : active,
					item[column]
				);
			this.valueIndex.possibleValues[column] = sortedSet(new Set([...active, ...removed]));
			this.valueIndex.possibleValuesActive[column] = sortedSet(active);
		}
		if (this.valueIndex) return this.valueIndex;
		this.valueIndexVersion = version;

		const index = this.datasetIndex;
		const columns = this.filters;
		const precomputed = new Set<string>(
			index
				? this.datasetColumns.filter(
						(column) =>
							Array.isArray(index.possibleValues[column]) &&
							Array.isArray(index.possibleValuesActive[column])
					)
				: []
		);
		const scanned = columns.filter((column) => !precomputed.has(column));

		// One pass over the products, straight into sets: columns like store
		// availability have hundreds of thousands of product/value pairs but only
		// a few hundred unique values. Active and removed products go into separate
		// sets, merged afterwards, so each value is only added once.
		const active = scanned.map(() => new Set<any>());
		const removed = scanned.map(() => new Set<any>());
		for (const item of this.data) {
			const target = item[AllColumns.RemovedFromSelection] === true ? removed : active;
			for (let col = 0; col < scanned.length; col++) collectValue(target[col], item[scanned[col]]);
		}

		const possibleValues: Record<string, Set<any>> = {};
		const possibleValuesActive: Record<string, Set<any>> = {};
		scanned.forEach((column, idx) => {
			possibleValues[column] = sortedSet(new Set([...active[idx], ...removed[idx]]));
			possibleValuesActive[column] = sortedSet(active[idx]);
		});
		for (const column of precomputed) {
			const all = this.datasetIndexComplete ? index!.possibleValues : index!.possibleValuesActive;
			possibleValues[column] = new Set(all[column]);
			possibleValuesActive[column] = new Set(index!.possibleValuesActive[column]);
		}

		// Get column type by getting the type of the first value in the possible values set
		const columnTypes: Record<string, ColumnType> = Object.fromEntries(
			columns.map((key) => {
				if (columnsHandledAsSet.includes(key as (typeof columnsHandledAsSet)[number]))
					return [key, 'object'];
				if (key === AllColumns.History) return [key, 'object'];
				return [key, typeof possibleValues[key].values().next().value];
			})
		);

		const ranges = (source: Record<string, Set<any>>, allowEmpty: boolean) =>
			columns.map((column) => {
				if (columnTypes[column] !== 'number') return null;
				if (column === AllColumns.SortingCode) return null;
				if (!allowEmpty && !source[column].size) return null;
				return minAndMax(source[column]);
			});

		this.valueIndex = {
			possibleValues,
			possibleValuesActive,
			columnTypes,
			minAndMaxValues: ranges(possibleValues, true),
			minAndMaxValuesActive: ranges(possibleValuesActive, false)
		};
		return this.valueIndex;
	}

	get possibleValues() {
		return this.getValueIndex().possibleValues;
	}

	get possibleValuesActive() {
		return this.getValueIndex().possibleValuesActive;
	}

	get columnTypes() {
		return this.getValueIndex().columnTypes;
	}

	get minAndMaxValues() {
		return this.getValueIndex().minAndMaxValues;
	}

	get minAndMaxValuesActive() {
		return this.getValueIndex().minAndMaxValuesActive;
	}

	/** Sub-category values seen under each parent value, e.g. the subtypes of each type. */
	get subValues() {
		if (this.subValuesCache) return this.subValuesCache;
		const subValues: Record<string, Record<string, Set<any>>> = {};
		for (const item of this.data) {
			for (const key of Object.keys(subCategoryMap)) {
				const value = item[key as keyof PriceListItem] as any;
				subValues[key] ??= {};
				subValues[key][value] ??= new Set();
				const subvalue =
					item[subCategoryMap[key as keyof typeof subCategoryMap] as keyof PriceListItem];
				if (subvalue && subvalue.toString().trim().length) subValues[key][value].add(subvalue);
			}
		}
		return (this.subValuesCache = subValues);
	}

	findDifferentSizesOfProduct(product: PriceListItem): PriceListItem[] {
		this.productVariants ??= new ProductVariantIndex(this.data, this.declaredBottleSizes);
		return this.productVariants.find(product);
	}

	getCategoryTree(): CategoryNode[] {
		this.categoryTree ??= buildCategoryTree(
			this.data.map((item) => ({
				type: item[AllColumns.Type],
				subType: item[AllColumns.SubType],
				removed: item[AllColumns.RemovedFromSelection] === true
			}))
		);
		return this.categoryTree;
	}

	getFilterKeys() {
		return this.filters;
	}

	getFilterValues(key: ColumnNames, showRemoved: boolean = true): (string | number)[] {
		this.trackChanges();
		const source = showRemoved ? this.possibleValues : this.possibleValuesActive;
		return source[key] ? Array.from(source[key]) : [];
	}

	getSubFilterValues(
		parent: ColumnNames,
		filterValues: FilterValues,
		showRemoved: boolean = true
	): string[] {
		const child = subCategoryMap[parent as keyof typeof subCategoryMap];
		if (!child) return [];

		// Copy the current filters, dropping numeric range filters. Numeric
		// filters default to their full [min, max] range and would otherwise
		// exclude products whose numeric value is null/NaN, causing their
		// sub-category values to disappear from the options.
		const filters = Object.fromEntries(
			Object.entries(filterValues)
				.filter(([key]) => this.getFilterType(key as ColumnNames) !== 'number')
				.map(([k, v]) => [k, [...v]])
		) as FilterValues;

		// Remove the child and everything below it
		let current: ColumnNames | undefined = child;

		while (current) {
			filters[current] = [];
			current = subCategoryMap[current as keyof typeof subCategoryMap];
		}

		return [
			...new Set(
				this.filter(filters)
					.filter((item) => showRemoved || !item[AllColumns.RemovedFromSelection])
					.map((item) => item[child])
					.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
			)
		];
	}

	getFilterType(key: ColumnNames) {
		return this.columnTypes[key];
	}

	getMinAndMaxValues(key: ColumnNames, showRemoved: boolean = true): [number, number] {
		const source = showRemoved ? this.minAndMaxValues : this.minAndMaxValuesActive;
		return source[this.filters.indexOf(key)] || [0, 0];
	}

	/** Matches values containing `query`, or with any word similar to it (to tolerate typos). */
	fuzzySearch(key: ColumnNames, query: string) {
		// Every value contains the empty string
		if (!query) return this.data.filter((item) => item[key]);
		const lowerQuery = query.toLowerCase();
		// Short queries match too many words loosely, so they only match exactly
		const fuzzy = lowerQuery.length >= MIN_FUZZY_QUERY_LENGTH;
		return this.data.filter((item) => {
			if (!item[key]) return false;
			const value = item[key].toString().toLowerCase();
			if (value.includes(lowerQuery)) return true;
			if (!fuzzy) return false;
			return value.split(' ').some((word) => {
				// Words whose length differs too much can't pass isSimilarString (the edit
				// distance is at least the length difference), so skip calling it
				const longer = Math.max(word.length, lowerQuery.length);
				if (Math.abs(word.length - lowerQuery.length) > Math.ceil(longer * 0.4)) return false;
				return isSimilarString(word, lowerQuery, 0.6);
			});
		});
	}

	sortBy(key: ColumnNames, ascending: boolean = true) {
		return this.data.sort((a, b) => {
			if (a[key] < b[key]) return ascending ? -1 : 1;
			if (a[key] > b[key]) return ascending ? 1 : -1;
			return 0;
		});
	}

	sortByNested(key: ColumnNames, nestedKey: string, ascending: boolean = true) {
		if (!nestedKey) {
			return this.sortBy(key, ascending);
		}
		return this.data.sort((a, b) => {
			// @ts-ignore
			if (a[key][nestedKey] < b[key][nestedKey]) return ascending ? -1 : 1;
			// @ts-ignore
			if (a[key][nestedKey] > b[key][nestedKey]) return ascending ? 1 : -1;
			return 0;
		});
	}

	fuzzySearchAndFilter(query: string, filters: Record<string, any>) {
		this.trackChanges();
		let result = this.fuzzySearch(AllColumns.Name, query);
		if (Object.keys(filters).length === 0) return result;

		filters = Object.fromEntries(
			Object.entries(filters).filter(([_, value]) => {
				if (value instanceof Set) return value.size > 0;
				return value.length > 0;
			})
		);

		const keys = Object.keys(filters);
		const types = Object.fromEntries(
			keys.map((key) => [key, this.getFilterType(key as ColumnNames)])
		);
		return result.filter((item) => {
			const temp = keys.every((key) => {
				const type = types[key];
				if (type === 'number' && Array.isArray(filters[key]) && filters[key].length === 2) {
					return item[key] >= filters[key][0] && item[key] <= filters[key][1];
				} else if (type === 'object' && item[key] instanceof Set && filters[key] instanceof Set) {
					const values = item[key];
					// Store availability uses OR semantics: match if available in any selected store
					if (key === AllColumns.StoreAvailability)
						return [...filters[key]].some((value) => values.has(value));
					return [...filters[key]].every((value) => values.has(value));
				} else if (filters[key] instanceof Set) {
					return item[key] && filters[key].has(item[key]);
				} else if (Array.isArray(filters[key])) {
					return item[key] && filters[key].includes(item[key]);
				} else {
					return item[key] === filters[key];
				}
			});
			return temp;
		});
	}

	filter(filters: Record<string, any>) {
		this.trackChanges();
		filters = Object.fromEntries(
			Object.entries(filters).filter(([, value]) => {
				if (value instanceof Set) return value.size > 0;
				return value.length > 0;
			})
		);
		const keys = Object.keys(filters);
		const types = Object.fromEntries(
			keys.map((key) => [key, this.getFilterType(key as ColumnNames)])
		);
		return this.data.filter((item) => {
			return keys.every((key) => {
				const type = types[key];
				if (type === 'number' && Array.isArray(filters[key]) && filters[key].length === 2) {
					return item[key] >= filters[key][0] && item[key] <= filters[key][1];
				} else if (filters[key] instanceof Set) {
					return item[key] && filters[key].has(item[key]);
				} else if (Array.isArray(filters[key])) {
					return item[key] && filters[key].includes(item[key]);
				} else {
					return item[key] === filters[key];
				}
			});
		});
	}

	filterByRange(key: ColumnNames, min: number, max: number) {
		return this.data.filter((item) => {
			const value = Number(item[key]);
			return !isNaN(value) && value >= min && value <= max;
		});
	}

	getPossibleValues() {
		const result: Record<string, any[]> = {};
		this.filters.forEach((key) => {
			result[key] = Array.from(this.possibleValues[key]);
		});
		return result;
	}

	findById(id: string) {
		return this.data.find((item) => item[AllColumns.Number] === id);
	}

	findByColumn(key: ColumnNames, value: any) {
		return this.data.filter((item) => item[key] === value);
	}
}

import {
	AllColumns,
	defaultSortingColumn,
	GenderOptionsMap,
	subCategoryMap,
	undefinedToZeroColumns,
	DrunkColumns,
	StoreColumns,
	columnsHandledAsString,
	columnsHandledAsSet
} from '$lib/utils/constants';
import { calculateDrunkValue } from '../utils/alko';
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
import { isSimilarString } from '$lib/utils/search';

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

export class Kaljakori {
	data: PriceListItem[] = [];
	personalInfo: PersonalInfo;
	filters: ColumnNames[] = [];
	possibleValues: Record<string, Set<any>> = {};
	possibleValuesActive: Record<string, Set<any>> = {};
	columnTypes: Record<string, ColumnType> = {};
	minAndMaxValues: ([number, number] | null)[] = [];
	minAndMaxValuesActive: ([number, number] | null)[] = [];
	subValues: Record<string, Record<string, Set<any>>> = {};

	constructor(table: DatasetRow[], personalInfo?: PersonalInfo, availability?: AvailabilityData) {
		this.personalInfo = personalInfo || { weight: null, gender: GenderOptionsMap.Unspecified };

		const [datasetColumns, ...rows] = table as [DatasetColumnNames[], ...DatasetRow[]];

		const drunkColumns = Object.values(DrunkColumns);
		const storeColumns = Object.values(StoreColumns);

		this.filters = [...datasetColumns, ...drunkColumns, ...storeColumns];

		const storeNameById = new Map(
			Object.entries(availability?.stores ?? {}).map(([id, store]) => [id, store.name])
		);

		const indexOfTypeColumn = datasetColumns.indexOf(AllColumns.Availability);

		const datasetColumnIndexes = datasetColumns.reduce(
			(obj, current, idx) => {
				return { ...obj, [current]: idx };
			},
			{} as Record<DatasetColumnNames, number>
		);

		const datasetValuesByColumn: any[][] = [...Array(datasetColumns.length)].map(() => []);
		const datasetValuesByColumnActive: any[][] = [...Array(datasetColumns.length)].map(() => []);

		const drunkValuesByColumn: any[][] = [...Array(drunkColumns.length)].map(() => []);
		const drunkValuesByColumnActive: any[][] = [...Array(drunkColumns.length)].map(() => []);

		const storeValuesByColumn: any[][] = [...Array(storeColumns.length)].map(() => []);
		const storeValuesByColumnActive: any[][] = [...Array(storeColumns.length)].map(() => []);

		const NUMBER_VALUE_REGEX = /^(?:0|[1-9]\d*)(?:\.\d+)?(?:\s*l)?$/;
		const isNumber = (value: any) => NUMBER_VALUE_REGEX.test(String(value));
		const toFormattedStringValue = (value: string) =>
			value.trim().toLowerCase().charAt(0).toUpperCase() + value.slice(1);

		for (let row = 0; row < rows.length; row++) {
			// Initialize an empty pricelist item
			const item: any = {};

			// Skip if item type is 'lahja- ja juomatarvikkeet'
			const valikoima = rows[row][indexOfTypeColumn];
			if (valikoima === 'tarvikevalikoima') continue;
			if (
				rows[row][datasetColumnIndexes[AllColumns.AlcoholPercentage]] === null ||
				rows[row][datasetColumnIndexes[AllColumns.AlcoholPercentage]] === undefined ||
				rows[row][datasetColumnIndexes[AllColumns.AlcoholPercentage]] === ''
			) {
				console.log(
					'Skipping product with missing alcohol percentage:',
					`${rows[row][datasetColumnIndexes[AllColumns.Name]] || 'Unknown product name'} www.alko.fi/tuotteet/${rows[row][datasetColumnIndexes[AllColumns.Number]] || 'Unknown product number'}`
				);
				continue;
			} // Skip rows without alcohol percentage

			if (
				rows[row][datasetColumnIndexes[AllColumns.Price]] === null ||
				rows[row][datasetColumnIndexes[AllColumns.Price]] === undefined ||
				rows[row][datasetColumnIndexes[AllColumns.Price]] === ''
			) {
				console.log(
					'Skipping product with missing price:',
					`${rows[row][datasetColumnIndexes[AllColumns.Name]] || 'Unknown product name'} www.alko.fi/tuotteet/${rows[row][datasetColumnIndexes[AllColumns.Number]] || 'Unknown product number'}`
				);
				continue; // Skip rows without price
			} // Skip rows without product number

			// Products removed from selection still populate `this.data` (they remain
			// viewable), but their values must not leak into the "active" possible-value
			// buckets used when removed products are hidden in the UI.
			const isRemoved = Boolean(rows[row][datasetColumnIndexes[AllColumns.RemovedFromSelection]]);

			rows[row][datasetColumnIndexes[AllColumns.BottleSize]] = resolveBottleSize(
				rows[row],
				datasetColumnIndexes
			);
			// Parse and assign item values and collect possible values
			for (let col = 0; col < datasetColumns.length; col++) {
				const key = datasetColumns[col];
				let value: string | number | Set<string> | any[] | undefined = rows[row][col];

				// Special handling for History column - preserve as array
				if (key === AllColumns.History) {
					item[key] = Array.isArray(value) ? value : [];
					continue; // Skip further processing for this column
				}

				// Special handling for the removed-from-selection flag - preserve as boolean
				if (key === AllColumns.RemovedFromSelection) {
					item[key] = Boolean(value);
					continue; // Skip further processing for this column
				}

				if (columnsHandledAsString.includes(key as (typeof columnsHandledAsString)[number]))
					value = toFormattedStringValue(String(value));
				else if (columnsHandledAsSet.includes(key as (typeof columnsHandledAsSet)[number]))
					value = new Set(
						String(value || '')
							.split(/[\.,]\s/)
							.map((v) => toFormattedStringValue(v.trim()))
							.filter((v) => v.length > 0)
					);
				else if (isNumber(value)) value = Number.parseFloat(String(value));
				else if (typeof value === 'string') value = toFormattedStringValue(value);
				else if (undefinedToZeroColumns.includes(key as any)) value = 0;
				else value = '';

				if (value instanceof Set && value.has('Null')) console.log(key, value);

				item[key] = value;
				if (
					isNumber(value) ||
					(typeof value === 'string' && value.length) ||
					typeof value === 'number'
				) {
					datasetValuesByColumn[col].push(value);
					if (!isRemoved) datasetValuesByColumnActive[col].push(value);
				}
				if (value instanceof Set && value.size) {
					datasetValuesByColumn[col].push(...Array.from(value));
					if (!isRemoved) datasetValuesByColumnActive[col].push(...Array.from(value));
				}
			}

			// Calculate drunk values
			const drunkValues = calculateDrunkValue(
				item[AllColumns.BottleSize],
				item[AllColumns.AlcoholPercentage],
				item[AllColumns.Price],
				personalInfo?.gender ?? undefined,
				personalInfo?.weight ?? undefined,
			);

			// Assign item drunk values and collect possible values
			drunkColumns.forEach((column, idx) => {
				drunkValuesByColumn[idx].push(drunkValues[column]);
				if (!isRemoved) drunkValuesByColumnActive[idx].push(drunkValues[column]);
				item[column] = drunkValues[column];
			});

			// Derive the set of store names this product is available in, resolved from
			// availability.json's productId -> storeId[] map (kept out of the dataset itself).
			const availableStoreNames = new Set(
				(availability?.product[item[AllColumns.Number]] ?? [])
					.map((storeId) => storeNameById.get(storeId))
					.filter((name): name is string => Boolean(name))
			);
			item[AllColumns.StoreAvailability] = availableStoreNames;
			storeValuesByColumn[0].push(...availableStoreNames);
			if (!isRemoved) storeValuesByColumnActive[0].push(...availableStoreNames);

			// Fill "Tyyppi" with "Ei määritelty" if empty
			if (!item[AllColumns.Type]) {
				item[AllColumns.Type] = 'Ei määritelty';
				datasetValuesByColumn[datasetColumnIndexes[AllColumns.Type]].push(item[AllColumns.Type]);
				if (!isRemoved)
					datasetValuesByColumnActive[datasetColumnIndexes[AllColumns.Type]].push(
						item[AllColumns.Type]
					);
			}

			// Fill "Alatyyppi" with "Oluttyyppi" or "Tyyppi" if empty
			if (!item[AllColumns.SubType]) {
				const fillType = item[AllColumns.BeerType] || item[AllColumns.Type];
				item[AllColumns.SubType] = fillType;
				datasetValuesByColumn[datasetColumnIndexes[AllColumns.SubType]].push(
					item[AllColumns.SubType]
				);
				if (!isRemoved)
					datasetValuesByColumnActive[datasetColumnIndexes[AllColumns.SubType]].push(
						item[AllColumns.SubType]
					);
			}

			// Add sub filter values
			Object.keys(subCategoryMap).forEach((key) => {
				const value = item[key as keyof PriceListItem];
				if (!this.subValues[key]) this.subValues[key] = {};
				if (!this.subValues[key][value]) this.subValues[key][value] = new Set();
				const subvalue =
					item[subCategoryMap[key as keyof typeof subCategoryMap] as keyof PriceListItem];
				if (subvalue && subvalue.toString().trim().length) {
					this.subValues[key][value].add(subvalue);
				}
			});

			this.data.push(item);
		}

		// Merge dataset, drunk and store columns and their values
		const mergedColumns = [...datasetColumns, ...drunkColumns, ...storeColumns];
		const mergedValuesByColumn = [
			...datasetValuesByColumn,
			...drunkValuesByColumn,
			...storeValuesByColumn
		];
		const mergedValuesByColumnActive = [
			...datasetValuesByColumnActive,
			...drunkValuesByColumnActive,
			...storeValuesByColumnActive
		];

		// Create possible values object (full = incl. removed, active = excl. removed)
		// Dedupe before sorting - columns like store availability push one entry per
		// product/value pair (hundreds of thousands total) but only have a few hundred
		// unique values, so sorting after dedupe avoids sorting a huge duplicate-heavy array.
		const toSortedUniqueValues = (column: any[]) => new Set([...new Set(column)].sort());
		this.possibleValues = Object.fromEntries(
			mergedValuesByColumn.map((column, idx) => [mergedColumns[idx], toSortedUniqueValues(column)])
		);
		this.possibleValuesActive = Object.fromEntries(
			mergedValuesByColumnActive.map((column, idx) => [
				mergedColumns[idx],
				toSortedUniqueValues(column)
			])
		);

		// Get column type by getting the type of the first value in the possible values set
		this.columnTypes = Object.fromEntries(
			Object.entries(this.possibleValues).map(([key, value]) => {
				if (columnsHandledAsSet.includes(key as (typeof columnsHandledAsSet)[number]))
					return [key, 'object'];
				if (key === AllColumns.History) return [key, 'object'];
				return [key, typeof value.values().next().value];
			})
		);

		this.minAndMaxValues = mergedColumns.map((column, idx) => {
			if (this.columnTypes[column] !== 'number') return null;
			if (column === AllColumns.SortingCode) return null;
			return [Math.min(...mergedValuesByColumn[idx]), Math.max(...mergedValuesByColumn[idx])];
		});

		this.minAndMaxValuesActive = mergedColumns.map((column, idx) => {
			if (this.columnTypes[column] !== 'number') return null;
			if (column === AllColumns.SortingCode) return null;
			const values = mergedValuesByColumnActive[idx];
			if (!values.length) return null;
			return [Math.min(...values), Math.max(...values)];
		});

		this.data = this.sortBy(defaultSortingColumn);
		console.log(this.data);
	}

	getFilterKeys() {
		return this.filters;
	}

	getFilterValues(key: ColumnNames, showRemoved: boolean = true): (string | number)[] {
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

	fuzzySearch(key: ColumnNames, query: string) {
		return this.data.filter((item) => {
			if (!item[key]) return false;
			if (item[key].toString().toLowerCase().includes(query.toLowerCase())) return true;
			const parts = item[key].toString().split(' ');
			for (let part of parts) {
				return isSimilarString(part, query, 0.6);
			}
			return false;
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
		let result = this.fuzzySearch(AllColumns.Name, query);
		if (Object.keys(filters).length === 0) return result;

		filters = Object.fromEntries(
			Object.entries(filters).filter(([_, value]) => {
				if (value instanceof Set) return value.size > 0;
				return value.length > 0;
			})
		);

		return result.filter((item) => {
			const temp = Object.keys(filters).every((key) => {
				const type = this.getFilterType(key as ColumnNames);
				if (type === 'number' && Array.isArray(filters[key]) && filters[key].length === 2) {
					return item[key] >= filters[key][0] && item[key] <= filters[key][1];
				} else if (type === 'object' && item[key] instanceof Set && filters[key] instanceof Set) {
					// Store availability uses OR semantics: match if available in any selected store
					if (key === AllColumns.StoreAvailability)
						return filters[key].intersection(item[key]).size > 0;
					return filters[key].isSubsetOf(item[key]);
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
		filters = Object.fromEntries(
			Object.entries(filters).filter(([key, value]) => {
				if (value instanceof Set) return value.size > 0;
				return value.length > 0;
			})
		);
		return this.data.filter((item) => {
			return Object.keys(filters).every((key) => {
				const type = this.getFilterType(key as ColumnNames);
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

import { AllColumns, defaultSortingColumn, GenderOptionsMap, subCategoryMap, undefinedToZeroColumns, DrunkColumns, columnsHandledAsString, columnsHandledAsSet } from '$lib/utils/constants';
import { calculateDrunkValue } from '../utils/alko';
import { type ColumnNames, type DatasetColumnNames, type DatasetRow, type Filter, type FilterValues, type ColumnType, type PersonalInfo, type PriceListItem } from '../types';
import { isSimilarString } from '$lib/utils/search';

export class Kaljakori {
	data: PriceListItem[] = [];
	personalInfo: PersonalInfo;
	filters: ColumnNames[] = [];
	possibleValues: Record<string, Set<any>> = {};
	columnTypes: Record<string, ColumnType> = {};
	minAndMaxValues: ([number, number] | null)[] = [];
	subValues: Record<string, Record<string, Set<any>>> = {}

	constructor(table: DatasetRow[], personalInfo?: PersonalInfo) {
		this.personalInfo = personalInfo || { weight: null, gender: GenderOptionsMap.Unspecified };

		const [datasetColumns, ...rows] = table as [DatasetColumnNames[], ...DatasetRow[]];

		const drunkColumns = Object.values(DrunkColumns);

		this.filters = [...datasetColumns, ...drunkColumns];

		const indexOfTypeColumn = datasetColumns.indexOf(AllColumns.Type);

		const datasetColumnIndexes = datasetColumns.reduce((obj, current, idx) => {
			return {...obj, [current]: idx}
		}, {} as Record<DatasetColumnNames, number>)

		const datasetValuesByColumn: any[][] = [...Array(datasetColumns.length)].map(() => []);

		const drunkValuesByColumn: any[][] = [...Array(drunkColumns.length)].map(() => []);

		const NUMBER_VALUE_REGEX = /^(?:0|[1-9]\d*)(?:\.\d+)?(?:\s*l)?$/
		const isNumber = (value: any) => NUMBER_VALUE_REGEX.test(String(value))
		const toFormattedStringValue = (value: string) => value.trim().toLowerCase().charAt(0).toUpperCase() + value.slice(1)

		for (let row = 0; row < rows.length; row++) {
			// Initialize an empty pricelist item
			const item: any = {};

			// Skip if item type is 'lahja- ja juomatarvikkeet'
			const type = rows[row][indexOfTypeColumn];
			if (type === 'lahja- ja juomatarvikkeet') continue;

			// Parse and assign item values and collect possible values
			for (let col = 0; col < datasetColumns.length; col++) {

				const key = datasetColumns[col];
				let value: string | number | Set<string> | undefined = rows[row][col];

				if (columnsHandledAsString.includes(key as typeof columnsHandledAsString[number])) value = toFormattedStringValue(String(value))
				else if (columnsHandledAsSet.includes(key as typeof columnsHandledAsSet[number])) value = new Set(String(value || "").split(/[\.,]\s/).map(v => toFormattedStringValue(v.trim())).filter(v => v.length > 0))
				else if (isNumber(value)) value = Number.parseFloat(String(value));
				else if (typeof value === "string") value = toFormattedStringValue(value);
				else if (undefinedToZeroColumns.includes(key as any)) value = 0
				else value = ""

				if(value instanceof Set && value.has("Null")) console.log(key, value)

				item[key] = value
				if (isNumber(value) || (typeof value === "string" && value.length) || typeof value === "number") datasetValuesByColumn[col].push(value);
				if (value instanceof Set && value.size) datasetValuesByColumn[col].push(...Array.from(value));
			}

			// Calculate drunk values
			const drunkValues = calculateDrunkValue(
				item[AllColumns.BottleSize],
				item[AllColumns.AlcoholPercentage],
				item[AllColumns.Price],
				personalInfo?.gender,
				personalInfo?.weight ?? undefined
			);

			// Assign item drunk values and collect possible values
			drunkColumns.forEach((column, idx) => {
				drunkValuesByColumn[idx].push(drunkValues[column]);
				item[column] = drunkValues[column]
			})

			// Fill "Tyyppi" with "Ei määritelty" if empty
			if (!item[AllColumns.Type]) {
				item[AllColumns.Type] = "Ei määritelty";
				datasetValuesByColumn[datasetColumnIndexes[AllColumns.Type]].push(item[AllColumns.Type]);
			}

			// Fill "Alatyyppi" with "Oluttyyppi" or "Tyyppi" if empty
			if (!item[AllColumns.SubType]) {
				const fillType = item[AllColumns.BeerType] || item[AllColumns.Type];
				item[AllColumns.SubType] = fillType;
				datasetValuesByColumn[datasetColumnIndexes[AllColumns.SubType]].push(item[AllColumns.SubType]);
			}

			// Add sub filter values
			Object.keys(subCategoryMap).forEach((key) => {
				const value = item[key as keyof PriceListItem];
				if(!this.subValues[key]) this.subValues[key] = {}
				if(!this.subValues[key][value]) this.subValues[key][value] = new Set();
				const subvalue = item[subCategoryMap[key as keyof typeof subCategoryMap] as keyof PriceListItem];
				if(subvalue && subvalue.toString().trim().length) {
					this.subValues[key][value].add(subvalue);
				}
			})

			this.data.push(item);
		}

		// Merge dataset and drunk columns and their values
		const mergedColumns = [...datasetColumns, ...drunkColumns];
		const mergedValuesByColumn = [...datasetValuesByColumn, ...drunkValuesByColumn];

		// Create possible values object
		this.possibleValues = Object.fromEntries(
			mergedValuesByColumn.map((column, idx) => [mergedColumns[idx], new Set(column.sort())])
		);

		// Get column type by getting the type of the first value in the possible values set
		this.columnTypes = Object.fromEntries(
			Object.entries(this.possibleValues).map(([key, value]) => {
				if(columnsHandledAsSet.includes(key as typeof columnsHandledAsSet[number])) return [ key, "object" ]
				return [ key, typeof value.values().next().value ]
			})
		);

		this.minAndMaxValues = mergedColumns.map((column, idx) => {
			if (this.columnTypes[column] !== "number") return null
			if (column === AllColumns.SortingCode) return null
			return [Math.min(...mergedValuesByColumn[idx]), Math.max(...mergedValuesByColumn[idx])]
		})

		this.data = this.sortBy(defaultSortingColumn);
		console.log(this.data)
	}

	getFilterKeys() {
		return this.filters;
	}

	getFilterValues(key: ColumnNames): (string | number)[] {
		return this.possibleValues[key] ? Array.from(this.possibleValues[key]) : [];
	}

	getSubFilterValues(key: ColumnNames, value: any) {
		return this.subValues[key] ? Array.from(this.subValues[key][value]) : [];
	}

	getFilterType(key: ColumnNames) {
		return this.columnTypes[key];
	}

	getMinAndMaxValues(key: ColumnNames) : [number, number] {
		return this.minAndMaxValues[this.filters.indexOf(key)] || [0, 0]
	}

	fuzzySearch(key: ColumnNames, query: string) {
		return this.data.filter((item) => {
			if(!item[key]) return false
			if(item[key].toString().toLowerCase().includes(query.toLowerCase())) return true
			const parts = item[key].toString().split(" ")
			for(let part of parts) {
				return isSimilarString(part, query, 0.6)
			}
			return false
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
					return filters[key].isSubsetOf(item[key]);
				} else if (filters[key] instanceof Set) {
					return item[key] && filters[key].has(item[key]);
				} else if (Array.isArray(filters[key])) {
					return item[key] && filters[key].includes(item[key]);
				} else {
					return item[key] === filters[key];
				}
			});
			return temp
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

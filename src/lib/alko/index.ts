import { AllColumns, DatasetColumns, defaultSortingColumn, DrunkColumns } from '$lib/utils/constants';
import { calculateDrunkValue, Gender } from '../utils/alcoholCounter';
import type { ColumnNames, PriceListItem } from './types';

export class Kaljakori {
	data: PriceListItem[] = [];
	personalInfo: { weight: number; gender: Gender };
	filters: (typeof AllColumns[keyof typeof AllColumns])[] = [];
	possibleValues: Record<string, Set<any>> = {};
	columnTypes: Record<string, string>;
	minAndMaxValues: (number[] | null)[] = [];

	constructor(table: string[][], personalInfo?: { weight: number; gender: Gender }) {
		console.log('table[1]', table[1]);

		this.personalInfo = personalInfo || { weight: 0, gender: Gender.Unspecified };

		const [datasetColumns, ...rows] = table as [(typeof DatasetColumns[keyof typeof DatasetColumns])[], ...(string | number | undefined)[][]];

		const drunkColumns = Object.values(DrunkColumns);

		const isNumeric = (num: unknown) => (typeof num === "string" && num.trim() !== '') && !isNaN(num as unknown as number);

		this.filters = [...datasetColumns, ...drunkColumns];

		const indexOfTypeColumn = datasetColumns.indexOf(AllColumns.Type);

		const datasetValuesByColumn: any[][] = [...Array(datasetColumns.length)].map(() => []);

        const drunkValuesByColumn: any[][] = [...Array(drunkColumns.length)].map(() => []);

		for (let row = 0; row < rows.length; row++) {
			const item: any = {};
			const type = rows[row][indexOfTypeColumn];
			if (type === 'lahja- ja juomatarvikkeet') continue;
			for (let col = 0; col < datasetColumns.length; col++) {
				const key = datasetColumns[col];
				let value: string | number | undefined = rows[row][col];
				const isNumber = (value !== undefined && isNumeric(value) && !['Numero', 'Nimi', 'Valmistaja'].includes(key)) || typeof value === "number";
				if(key === AllColumns.BottleSize) {
					value = parseFloat(value as string)
				} else if (isNumber) {
					value = Number(value);
				} else if(typeof value === "string") {
					value = (value as string).trim().toLowerCase().charAt(0).toUpperCase() + (value as string).slice(1);
				} else {
					value = ""
				}

				item[key] = value
				if(isNumber || (value as string).length || key === AllColumns.BottleSize) datasetValuesByColumn[col].push(value);
			}

			const drunkValues = calculateDrunkValue(
				item[AllColumns.BottleSize],
				item[AllColumns.AlcoholPercentage],
				item[AllColumns.Price],
				personalInfo?.gender,
				personalInfo?.weight
			);

            drunkColumns.forEach((column, idx) => {
                drunkValuesByColumn[idx].push(drunkValues[idx])
                item[column] = drunkValues[idx]
            })

			this.data.push(item);
		}

		const mergedColumns = [...datasetColumns, ...drunkColumns];
		const mergedValuesByColumn = [...datasetValuesByColumn, ...drunkValuesByColumn];

		this.possibleValues = Object.fromEntries(
			mergedValuesByColumn.map((column, idx) => [mergedColumns[idx], new Set(column.sort())])
		);

		console.log(this.possibleValues[AllColumns.AlcoholPercentage])

		this.columnTypes = Object.fromEntries(
			Object.entries(this.possibleValues).map(([key, value]) => [
				key,
				typeof value.values().next().value
			])
		);
		
		this.minAndMaxValues = mergedColumns.map((column, idx) => {
			if(this.columnTypes[column] !== "number") return null
			if(column === AllColumns.SortingCode) return null
			return [Math.min(...mergedValuesByColumn[idx]), Math.max(...mergedValuesByColumn[idx])]
		})

		console.log("minAndMax", this.minAndMaxValues)

		this.data = this.sortBy(defaultSortingColumn);
	}

	getFilterKeys() {
		return this.filters;
	}

	getFilterValues(key: string) {
		return this.possibleValues[key] ? Array.from(this.possibleValues[key]) : [];
	}

	getFilterType(key: string) {
		return this.columnTypes[key];
	}

	getMinAndMaxValues(key: ColumnNames) {
		return this.minAndMaxValues[this.filters.indexOf(key)]
	}

	fuzzySearch(key: ColumnNames, query: string) {
		const lowerQuery = query.toLowerCase();
		return this.data.filter((item) => {
			return item[key] && item[key].toString().toLowerCase().includes(lowerQuery);
		});
	}

	sortBy(key: string, ascending: boolean = true) {
		return this.data.sort((a, b) => {
			if (a[key] < b[key]) return ascending ? -1 : 1;
			if (a[key] > b[key]) return ascending ? 1 : -1;
			return 0;
		});
	}

	sortByNested(key: string, nestedKey: string, ascending: boolean = true) {
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

	filter(filters: Record<string, any>) {
		console.log('Current filters', filters);
		filters = Object.fromEntries(
			Object.entries(filters).filter(([key, value]) => {
				if (value instanceof Set) return value.size > 0;
				return value.length > 0;
			})
		);
		return this.data.filter((item) => {
			return Object.keys(filters).every((key) => {
				const type = this.getFilterType(key);
				// Range filter for numbers
				if (type === 'number' && Array.isArray(filters[key]) && filters[key].length === 2) {
					// TODO: Fix
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

	filterByRange(key: string, min: number, max: number) {
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
}

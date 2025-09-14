import { calculateDrunkValue, Gender } from '../utils/alcoholCounter';
import type { Filter, NumberValueKeys, PriceListItem } from './types';

export class Kaljakori {
	data: PriceListItem[] = [];
	personalInfo: { weight: number; gender: Gender };
	filters: string[] = [];
	possibleValues: Record<string, Set<any>> = {};
	columnTypes: Record<string, string>;
	min: {
		[key in NumberValueKeys]: number;
	} = {
		Alkoholigrammat: Infinity,
		'Alkoholigrammat / €': Infinity,
		'Arvioidut promillet': Infinity,
		'Promillet / €': Infinity,
		Annokset: Infinity,
		Pullokoko: Infinity,
		Hinta: Infinity,
		'Alkoholi-%': Infinity
	};
	max: {
		[key in NumberValueKeys]: number;
	} = {
		Alkoholigrammat: -Infinity,
		'Alkoholigrammat / €': -Infinity,
		'Arvioidut promillet': -Infinity,
		'Promillet / €': -Infinity,
		Annokset: -Infinity,
		Pullokoko: -Infinity,
		Hinta: -Infinity,
		'Alkoholi-%': -Infinity
	};
	constructor(table: string[][], personalInfo?: { weight: number; gender: Gender }) {
		console.log('table[1]', table[1]);

		this.personalInfo = personalInfo || { weight: 0, gender: Gender.Unspecified };

		const [datasetColumns, ...rows] = table;

		const drunkColumns = [
			'Alkoholigrammat',
			'Alkoholigrammat / €',
			'Arvioidut promillet',
			'Promillet / €',
			'Annokset'
		];

		this.filters = [...datasetColumns, ...drunkColumns];

		const indexOfTypeColumn = datasetColumns.indexOf('Tyyppi');

		const datasetValuesByColumn: any[][] = Array.apply(null, Array(datasetColumns.length)).map(
			(_) => []
		);

        const drunkValuesByColumn: any[][] = Array.apply(null, Array(drunkColumns.length)).map(
			(_) => []
		);

		for (let row = 0; row < rows.length; row++) {
			const item: any = {};
			const type = rows[row][indexOfTypeColumn];
			if (type === 'lahja- ja juomatarvikkeet') continue;
			for (let col = 0; col < datasetColumns.length; col++) {
				const key = datasetColumns[col];
				let value: string | number = rows[row][col];
				if (key === 'Pullokoko') value = parseFloat(value);
				const number = Number(value);
				const isNumber = !Number.isNaN(number) && !['Numero', 'Nimi', 'Valmistaja'].includes(key);
				if (!isNumber && value && typeof value === 'string')
					value = value.trim().toLowerCase().charAt(0).toUpperCase() + value.slice(1);
				else value = number;
				item[key] = value;
				if (value) datasetValuesByColumn[col].push(value);
			}

			const drunkValues = calculateDrunkValue(
				item['Pullokoko'],
				item['Alkoholi-%'],
				item['Hinta'],
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
		const mergedValuesByColumn = [...datasetValuesByColumn, ...datasetValuesByColumn];

		this.possibleValues = Object.fromEntries(
			mergedValuesByColumn.map((column, i) => [mergedColumns[i], new Set(column.sort())])
		);

		console.log('possibleValues', this.possibleValues);

		this.columnTypes = Object.fromEntries(
			Object.entries(this.possibleValues).map(([key, value]) => [
				key,
				typeof value.values().next().value
			])
		);

		console.log('columnTypes', this.columnTypes);

		this.data.forEach((item, idx) => {
			(Object.keys(this.min) as NumberValueKeys[]).forEach((key: NumberValueKeys) => {
				const value = Number(item[key]);
				if (!isNaN(value)) {
					if (value < this.min[key]) this.min[key] = value;
					if (value > this.max[key]) this.max[key] = value;
				}
			});
		});

		this.data = this.sortBy('Promillet / €');
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

	fuzzySearch(key: string, query: string) {
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

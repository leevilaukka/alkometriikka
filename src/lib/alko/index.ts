import { calculateDrunkValue, Gender } from '../utils/alcoholCounter';
import type { Filter, NumberValueKeys, PriceListItem } from './types';

export class Kaljakori {
    data: PriceListItem[] = [];
    personalInfo: { weight: number; gender: Gender };
    filters: Record<string, Filter> = {};
    possibleValues: Record<string, Set<any>> = {};
    columnTypes: Record<string, string>
    min: {
        [key in NumberValueKeys]: number;
    } = {
        "Alkoholigrammat": Infinity,
        "Alkoholigrammat / €": Infinity,
        "Arvioidut promillet": Infinity,
        "Promillet / €": Infinity,
        "Annokset": Infinity,
        "Pullokoko": Infinity,
        "Hinta": Infinity,
        "Alkoholi-%": Infinity,
    };
    max: {
        [key in NumberValueKeys]: number;
    } = {
        "Alkoholigrammat": -Infinity,
        "Alkoholigrammat / €": -Infinity,
        "Arvioidut promillet": -Infinity,
        "Promillet / €": -Infinity,
        "Annokset": -Infinity,
        "Pullokoko": -Infinity,
        "Hinta": -Infinity,
        "Alkoholi-%": -Infinity,
    };
    constructor(table: string[][], personalInfo?: { weight: number; gender: Gender }) {
        console.log("table[1]", table[1])

        this.personalInfo = personalInfo || { weight: 0, gender: Gender.Unspecified };

        const [columns, ...rows] = table
        const indexOfTypeColumn = columns.indexOf("Tyyppi");
        const valuesByColumn: any[][] = Array.apply(null, Array(columns.length)).map(_ => [])

        for(let row = 0; row < rows.length; row++) {
            const item: any = {}
            const type = rows[row][indexOfTypeColumn]
            if(type === "lahja- ja juomatarvikkeet") continue;
            for(let col = 0; col < columns.length; col++) {
                const key = columns[col]
                let value: string | number = rows[row][col]
                if(key === "Pullokoko") value = parseFloat(value);
                const number = Number(value)
                const isNumber = !Number.isNaN(number) && !["Numero", "Nimi", "Valmistaja"].includes(key)
                if(!isNumber && value && typeof value === "string") value = value.trim().toLowerCase().charAt(0).toUpperCase() + value.slice(1)
                else value = number
                item[key] = value
                if(value) valuesByColumn[col].push(value)
            }
            
            Object.assign(item, calculateDrunkValue(
                item["Pullokoko"],
                item["Alkoholi-%"],
                item["Hinta"],
                personalInfo?.gender,
                personalInfo?.weight
            ));

            this.data.push(item)
        }

        this.possibleValues = Object.fromEntries(valuesByColumn.map((column, i) => [columns[i], new Set(column.sort())]))

        console.log("possibleValues", this.possibleValues)

        this.columnTypes = Object.fromEntries(Object.entries(this.possibleValues).map(([key, value]) => [key, typeof value.values().next().value]))

        console.log("columnTypes", this.columnTypes)

        this.data.forEach((item, idx) => {
            (Object.keys(this.min) as NumberValueKeys[]).forEach((key: NumberValueKeys) => {
                const value = Number(item[key]);
                if (!isNaN(value)) {
                    if (value < this.min[key]) this.min[key] = value;
                    if (value > this.max[key]) this.max[key] = value;
                }
            });

            Object.keys(item).forEach(key => {
                if (!this.filters[key]) {
                    this.filters[key] = {
                        possibleTypes: new Set(),
                        type: undefined
                    };
                }

                this.filters[key].possibleTypes.add(typeof item[key])
            });

        });

        Object.keys(this.filters).forEach(filter => {
            if(this.filters[filter].possibleTypes.size > 1) this.filters[filter].type = "any";
            else this.filters[filter].type = this.filters[filter].possibleTypes.values().next().value;
        })

        this.data = this.sortBy("Promillet / €")
    }

    getFilterKeys() {
        return Object.keys(this.filters);
    }

    getFilterValues(key: string) {
        return this.possibleValues[key] ? Array.from(this.possibleValues[key]) : [];
    }

    getFilterType(key: string) {
        return this.columnTypes[key];
    }

    fuzzySearch(key: string, query: string) {
        const lowerQuery = query.toLowerCase();
        return this.data.filter(item => {
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
        if(!nestedKey) {
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
        console.log("Current filters", filters)
        filters = Object.fromEntries(Object.entries(filters).filter(([key, value]) => {
            if(value instanceof Set) return value.size > 0
            return value.length > 0
         }))
        return this.data.filter(item => {
            return Object.keys(filters).every(key => {
                const type = this.getFilterType(key);
                // Range filter for numbers
                if(type === "number" && Array.isArray(filters[key])&& filters[key].length === 2) {
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
        return this.data.filter(item => {
            const value = Number(item[key]);
            return !isNaN(value) && value >= min && value <= max;
        });
    }

    getPossibleValues() {
        const result: Record<string, any[]> = {};
        Object.keys(this.filters).forEach(key => {
            result[key] = Array.from(this.possibleValues[key]);
        });
        return result;
    }
}

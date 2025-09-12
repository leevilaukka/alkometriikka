import { calculateDrunkValue, Gender, type DrunkValueResult } from '../utils/alcoholCounter';

type NativeTypes = "string" | "number" | "object" | "undefined" | "function" | "boolean" | "symbol" | "bigint";

type Filter = {
    type: NativeTypes | "any" | undefined
    possibleValues: Set<any>
    // Set of all possible types 
    possibleTypes: Set<NativeTypes>
}


type NumberValueKeys = keyof DrunkValueResult | "Pullokoko" | "Hinta" | "Alkoholi-%";

export class Kaljakori {
    data: any[];
    personalInfo: { weight: number; gender: Gender };
    filters: Record<string, Filter> = {};
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
    constructor(data: any[], personalInfo?: { weight: number; gender: Gender }) {
        this.data = data;
        this.personalInfo = personalInfo || { weight: 0, gender: Gender.Unspecified };
       

        this.data.filter(item => item["Tyyppi"] !== "lahja- ja juomatarvikkeet").forEach(item => {
            Object.assign(item, calculateDrunkValue(
                parseFloat(item["Pullokoko"]),
                parseFloat(item["Alkoholi-%"]),
                parseFloat(item["Hinta"]),
                personalInfo?.gender,
                personalInfo?.weight
            ));

            if(typeof item["Tyyppi"] === "string") item["Tyyppi"] = item["Tyyppi"].toLowerCase().charAt(0).toUpperCase() + item["Tyyppi"].slice(1);

            item["Pullokoko"] = parseFloat(item["Pullokoko"]);
            item["Hinta"] = parseFloat(item["Hinta"]);
            item["Alkoholi-%"] = parseFloat(item["Alkoholi-%"]);

            (Object.keys(this.min) as NumberValueKeys[]).forEach((key: NumberValueKeys) => {
                if(item[key] < this.min[key]) this.min[key] = item[key]
                if(item[key] > this.max[key]) this.max[key] = item[key]
            });

            Object.keys(item).forEach(key => {
                if (!this.filters[key]) {
                    this.filters[key] = {
                        possibleValues: new Set(),
                        possibleTypes: new Set(),
                        type: undefined
                    };
                }
                this.filters[key].possibleTypes.add(typeof item[key])
                if(Array.isArray(item[key])) {
                    item[key].forEach((val: any) => this.filters[key].possibleValues.add(val));
                    return;
                } else {
                    this.filters[key].possibleValues.add(item[key]);
                }
            });

            const sortedFilters = ["Valmistusmaa", "Valmistaja", "Tyyppi"]

            sortedFilters.forEach(filter => {
                this.filters[filter].possibleValues = new Set(Array.from(this.filters[filter].possibleValues).sort((a, b) => (a > b ? 1 : -1)));
            });
        });

        Object.keys(this.filters).forEach(filter => {
            if(this.filters[filter].possibleTypes.size > 1) this.filters[filter].type = "any";
            else this.filters[filter].type = this.filters[filter].possibleTypes.values().next().value;
        })

        this.data = this.sortBy("Promillet / €", true)
    }

    getFilterKeys() {
        return Object.keys(this.filters);
    }

    getFilterValues(key: string) {
        return this.filters[key].possibleValues ? Array.from(this.filters[key].possibleValues) : [];
    }

    getFilterType(key: string) {
        return this.filters[key].type;
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
            if (a[key][nestedKey] < b[key][nestedKey]) return ascending ? -1 : 1;
            if (a[key][nestedKey] > b[key][nestedKey]) return ascending ? 1 : -1;
            return 0;
        });
    }

    filter(filters: Record<string, any>) {
        console.log(filters)
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
            return item[key] >= min && item[key] <= max;
        });
    }

    getPossibleValues() {
        const result: Record<string, any[]> = {};
        Object.keys(this.filters).forEach(key => {
            result[key] = Array.from(this.filters[key].possibleValues);
        });
        return result;
    }
}

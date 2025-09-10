import { calculateDrunkValue, Gender } from '../utils/alcoholCounter';

type NativeTypes = "string" | "number" | "object" | "undefined" | "function" | "boolean" | "symbol" | "bigint";

type Filter = {
    type: NativeTypes | "any" | undefined
    possibleValues: Set<any>
    // Set of all possible types 
    possibleTypes: Set<NativeTypes>
}

export class Kaljakori {
    data: any[];
    personalInfo: { weight: number; gender: Gender };
    filters: Record<string, Filter> = {};
    minBacPerEuro: number;
    maxBacPerEuro: number;
    maxBottleSize: number;
    minBottleSize: number;
    maxPrice: number;
    minPrice: number;
    constructor(data: any[], personalInfo?: { weight: number; gender: Gender }) {
        this.data = data;
        this.personalInfo = personalInfo || { weight: 0, gender: Gender.Unspecified };
        this.minBacPerEuro = Infinity;
        this.maxBacPerEuro = -Infinity;

        this.maxBottleSize = -Infinity;
        this.minBottleSize = Infinity;

        this.maxPrice = -Infinity;
        this.minPrice = Infinity;

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

            if (item["Promillet / €"] < this.minBacPerEuro) {
                this.minBacPerEuro = item["Promillet / €"];
            }
            if (item["Promillet / €"] > this.maxBacPerEuro) {
                this.maxBacPerEuro = item["Promillet / €"];
            }
            if (item["Pullokoko"] < this.minBottleSize) {
                this.minBottleSize = item["Pullokoko"];
            }
            if (item["Pullokoko"] > this.maxBottleSize) {
                this.maxBottleSize = item["Pullokoko"];
            }
            if (item["Hinta"] < this.minPrice) {
                this.minPrice = item["Hinta"];
            }
            if (item["Hinta"] > this.maxPrice) {
                this.maxPrice = item["Hinta"];
            }
            

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
        filters = Object.fromEntries(Object.entries(filters).filter(([key, value]) => { return value.length > 0 }))
        return this.data.filter(item => {
            return Object.keys(filters).every(key => {
                const type = this.getFilterType(key);
                if(type === "number" && Array.isArray(filters[key]) && filters[key].length === 2) {
                    return item[key] >= filters[key][0] && item[key] <= filters[key][1];
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

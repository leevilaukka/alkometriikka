import type { Kaljakori } from "$lib/alko"
import type { ColumnNames, FilterValue, FilterValues, PriceListItem } from "$lib/types"
import { AllColumns, shownFilters, subCategoryMap } from "./constants";

export function initFilterValues(kaljakori: Kaljakori, searchParams?: URLSearchParams) {
    const valuesSearchParams = searchParams ? filterValuesFromSearchParameters(searchParams, kaljakori) : {}
	return [...shownFilters, ...Object.values(subCategoryMap)].reduce((obj, filter) => {
		if (kaljakori.getFilterType(filter) == 'number')
			obj[filter] = valuesSearchParams[filter as keyof typeof valuesSearchParams] ?? kaljakori.getMinAndMaxValues(filter);
		else if (kaljakori.getFilterType(filter) == 'string') obj[filter] = valuesSearchParams[filter as keyof typeof valuesSearchParams] || [];
		else if (kaljakori.getFilterType(filter) == 'object') obj[filter] = valuesSearchParams[filter as keyof typeof valuesSearchParams] || [];
		return obj;
	}, {} as Record<ColumnNames, FilterValue>);
}

export function searchParametersFromFilterValues(filterValues: FilterValues, kaljakori: Kaljakori) {
    return Object.entries(filterValues).reduce<Record<string, string | string[]>>((obj, [key, value]) => {
        const type = kaljakori.getFilterType(key as ColumnNames)
        if(type === "string" && Array.isArray(value)) {
            obj[key] = value as string[]
        } else if(type === "object") {
            obj[key] = Array.from(value) as string[]
        } else if(type === "number" && Array.isArray(value)) {
            const defaults = kaljakori.getMinAndMaxValues(key as ColumnNames)
            if(defaults && defaults[0] == value[0] && defaults[1] == value[1]) obj[key] = ""
            else obj[key] = `${value[0]}-${value[1]}`
        }
        return obj
    }, {})
}

export function filterValuesFromSearchParameters(searchParams: URLSearchParams, kaljakori: Kaljakori) {
    return [...searchParams.keys()].reduce((obj, key) => {
        const type = kaljakori.getFilterType(key as ColumnNames)
        return { ...obj, [key]: type === "number" ? searchParams.get(key)?.split("-").map(v => Number(v)) : searchParams.getAll(key) }
    }, {})
}

export function generateSimilarProductsFilter(product: PriceListItem, restrictions: Partial<Record<ColumnNames, string[] | number | string>>): FilterValues {
    return Object.fromEntries(Object.entries(restrictions).map(([key, value]) => {
        if(typeof value === "number" && typeof product[key] === "number" && Object.hasOwn(product, key)) return [key, [product[key] - (product[key] * value), product[key] + (product[key] * value)]]
        return [key, value]
    }))
}

export function findSimilarProducts(product: PriceListItem, kaljakori: Kaljakori, restrictions: Set<ColumnNames>, limit: number): PriceListItem[] {
    const scored = kaljakori.data.map(item => {
        let score = 0

        // TODO: Improve grape variety matching
        let grapeMultiplier = 1
        if(restrictions.has(AllColumns.GrapeVarieties)) {
            const productGrapes = product[AllColumns.GrapeVarieties]
            const itemGrapes = item[AllColumns.GrapeVarieties]
            const commonGrapes = productGrapes.intersection(itemGrapes).size
            grapeMultiplier = 1 + (commonGrapes / (Math.max(productGrapes.size, itemGrapes.size) || 1))
        }

        restrictions.forEach((key) => {
            const valueType = kaljakori.getFilterType(key)
            if(valueType === "number" && typeof product[key] === "number" && typeof item[key] === "number") {
                const diff = Math.abs(product[key] - item[key])
                const range = Math.max(product[key] * 0.2, 0.01) // 20% range or at least 0.01 to avoid division by zero
                score += Math.max(0, 1 - (diff / range)) // Linear scoring within range
            } else if(valueType === "string") {
                if(product[key] === item[key]) score += 1
            }
        });

        score *= grapeMultiplier

        return { item, score }
    });
    scored.sort((a, b) => b.score - a.score);
    return scored.filter(({ item }) => item[AllColumns.Number] !== product[AllColumns.Number]).slice(0, limit).map(({ item }) => item);
}
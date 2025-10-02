import type { Kaljakori } from "$lib/alko"
import type { ColumnNames } from "$lib/types"
import { shownFilters, subCategoryMap, LocalStorageKeys } from "./constants";

export function initFilterValues(kaljakori: Kaljakori, searchParams?: URLSearchParams): Record<ColumnNames, any[]> {
    const valuesSearchParams = searchParams ? filterValuesFromSearchParameters(searchParams, kaljakori) : {}
	return [...shownFilters, ...Object.values(subCategoryMap)].reduce((obj, filter) => {
		if (kaljakori.getFilterType(filter) == 'number')
			obj[filter] = valuesSearchParams[filter as keyof typeof valuesSearchParams] ?? kaljakori.getMinAndMaxValues(filter);
		else if (kaljakori.getFilterType(filter) == 'string') obj[filter] = valuesSearchParams[filter as keyof typeof valuesSearchParams] || [];
		else if (kaljakori.getFilterType(filter) == 'any') obj[filter] = valuesSearchParams[filter as keyof typeof valuesSearchParams] || [];
		return obj;
	}, {} as Record<ColumnNames, any[]>);
}

export function searchParametersFromFilterValues(filterValues: any, kaljakori: Kaljakori) {
    const searchParams = new URLSearchParams()
    Object.entries(filterValues).forEach(([key, value]: [string, any]) => {
        const type = kaljakori.getFilterType(key as ColumnNames)
        if(type === "string" && Array.isArray(value)) {
            value.forEach(v => v.length && searchParams.append(key, v))
        } else if(type === "number" && Array.isArray(value)) {
            searchParams.append(key, `${value[0]}-${value[1]}`)
        }
    })
    return searchParams
}

export function filterValuesFromSearchParameters(searchParams: URLSearchParams, kaljakori: Kaljakori) {
    return [...searchParams.keys()].reduce((obj, key) => {
        const type = kaljakori.getFilterType(key as ColumnNames)
        return { ...obj, [key]: type === "number" ? searchParams.get(key)?.split("-").map(v => Number(v)) : searchParams.getAll(key) }
    }, {})
}
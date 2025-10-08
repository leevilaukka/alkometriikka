import type { Kaljakori } from "$lib/alko"
import type { ColumnNames, FilterValue, FilterValues } from "$lib/types"
import { shownFilters, subCategoryMap } from "./constants";

export function initFilterValues(kaljakori: Kaljakori, searchParams?: URLSearchParams) {
    const valuesSearchParams = searchParams ? filterValuesFromSearchParameters(searchParams, kaljakori) : {}
	return [...shownFilters, ...Object.values(subCategoryMap)].reduce((obj, filter) => {
		if (kaljakori.getFilterType(filter) == 'number')
			obj[filter] = valuesSearchParams[filter as keyof typeof valuesSearchParams] ?? kaljakori.getMinAndMaxValues(filter);
		else if (kaljakori.getFilterType(filter) == 'string') obj[filter] = valuesSearchParams[filter as keyof typeof valuesSearchParams] || [];
		else if (kaljakori.getFilterType(filter) == 'any') obj[filter] = valuesSearchParams[filter as keyof typeof valuesSearchParams] || [];
		return obj;
	}, {} as Record<ColumnNames, FilterValue>);
}

export function searchParametersFromFilterValues(filterValues: FilterValues, kaljakori: Kaljakori) {
    return Object.entries(filterValues).reduce<Record<string, string | string[]>>((obj, [key, value]) => {
        const type = kaljakori.getFilterType(key as ColumnNames)
        if(type === "string" && Array.isArray(value)) {
            obj[key] = value as string[]
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
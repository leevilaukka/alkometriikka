import type { Kaljakori } from "$lib/alko"
import type { ColumnNames, FilterValue, FilterValues, PriceListItem } from "$lib/types"
import { AllColumns, shownFilters, subCategoryMap } from "./constants";
import { isSimilarString } from "./search";

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

        const multiplierColumnsAndWeights = {
            [AllColumns.GrapeVarieties]: 1,
            [AllColumns.Description]: 1,
        } as const;

        Object.keys(multiplierColumnsAndWeights).forEach((column) => {
            if(restrictions.has(column as keyof typeof multiplierColumnsAndWeights) && product[column] instanceof Set && item[column] instanceof Set) {
                let multiplier = 1
                const productValues = product[column]
                const itemValues = item[column]
                const commonValuesCount = productValues.intersection(itemValues).size
                multiplier += (commonValuesCount / (Math.max(productValues.size, itemValues.size) || 1))
                multiplier += multiplier * multiplierColumnsAndWeights[column as keyof typeof multiplierColumnsAndWeights]
                score *= multiplier
            }
        })

        return { item, score }
    });
    scored.sort((a, b) => b.score - a.score);
    console.log(scored.slice(0, 20))
    return scored.filter(({ item }) => item[AllColumns.Number] !== product[AllColumns.Number]).slice(0, limit).map(({ item }) => item);
}

export function getComparableProductName(product: PriceListItem): string {
    let out = product[AllColumns.Name]
    out = out.replace(/M{0,4}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})/g, "") // Remove roman numerals (before lowercase)
    out = out.toLowerCase()
    out = out.replace(product[AllColumns.PackagingType].toLowerCase(), "") // Remove packaging type
    out = out.replace(/\w+-pack/g, "") // Remove "x-pack"
    out = out.replace(/[\d.,%\-]+/g, "") // Remove numbers
    out = out.replace(/\s+/g, " ").trim() // Remove extra spaces
    return out
}

export function findDifferentSizeOfProduct(product: PriceListItem, kaljakori: Kaljakori): PriceListItem[] {
    // TODO: Fix this garbage V2 algo and improve matching + performance
    /*
        Examples of hard to match products due to different desc name etc:
        http://localhost:5173/tuotteet/777886 vs http://localhost:5173/tuotteet/901542 has different sugar level and desc?
        http://localhost:5173/tuotteet/700013 name has been misspelled 
        http://localhost:5173/tuotteet/720914 vs http://localhost:5173/tuotteet/792176 name sometimes includes % and sometimes not
        http://localhost:5173/tuotteet/580039 vs http://localhost:5173/tuotteet/008003 different subtype
        http://localhost:5173/tuotteet/131158 vs http://localhost:5173/tuotteet/902199 different product only difference in name
        http://localhost:5173/tuotteet/139586 vs http://localhost:5173/tuotteet/148781 different manufacturer listed but same product
    */
    const targetName = getComparableProductName(product)
    const filtered = kaljakori.filter({ 
        [AllColumns.Type]: new Set([product[AllColumns.Type]]),
        [AllColumns.AlcoholPercentage]: [product[AllColumns.AlcoholPercentage], product[AllColumns.AlcoholPercentage]],
        [AllColumns.Vintage]: [product[AllColumns.Vintage], product[AllColumns.Vintage]],
    })
    const scored = filtered.map((item) => {
        let score = 0
        const compareName = getComparableProductName(item)
        console.log(item[AllColumns.Name], "----->", compareName)
        if(isSimilarString(targetName, compareName, 0.85)) score += 1
        return {
            item,
            score
        }
    }).sort((a, b) => (a.score - b.score)).reverse()
    console.log("scored", scored)
    const out = []
    for(let i = 0; i<scored.length; i++) {
        const entry = scored[i]
        if(entry.item[AllColumns.Number] === product[AllColumns.Number]) continue
        if(i === 0) out.push(entry.item);
        else if(entry.score === scored[i - 1].score) out.push(entry.item)
        else return out;
    }
    return out
}
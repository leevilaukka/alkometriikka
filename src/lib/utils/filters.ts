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

export function findDifferentSizeOfProduct(product: PriceListItem, kaljakori: Kaljakori): PriceListItem[] {
    // TODO: Fix this garbage V1 algo and improve matching + performance
    /*
        Examples of hard to match products due to different desc name etc:
        http://localhost:5173/tuotteet/777886 vs http://localhost:5173/tuotteet/901542 has different sugar level and desc?
        http://localhost:5173/tuotteet/700013 name has been misspelled 
        http://localhost:5173/tuotteet/720914 vs http://localhost:5173/tuotteet/792176 name sometimes includes % and sometimes not

    */
    const targetWordList = product[AllColumns.Name].toLowerCase().replace(product[AllColumns.PackagingType].toLowerCase(), "").split(" ").map(part => {
        const number = Number.parseFloat(part.replaceAll(",", "."))
        if(Number.isNaN(number)) return part
        else return ""
    })
    const filtered = kaljakori.filter({ 
        [AllColumns.Type]: new Set([product[AllColumns.Type]]),
        [AllColumns.SubType]: new Set([product[AllColumns.SubType]]),
        [AllColumns.AlcoholPercentage]: new Set([product[AllColumns.AlcoholPercentage]]),
        [AllColumns.Sugar]: [product[AllColumns.Sugar] - product[AllColumns.Sugar] * 0.5, product[AllColumns.Sugar] + product[AllColumns.Sugar] * 0.5],
    })
    const scored = filtered.map((item) => {
        const comparisonWordList = item[AllColumns.Name].toLowerCase().replace(product[AllColumns.PackagingType].toLowerCase(), "").split(" ").map(part => {
            const number = Number.parseFloat(part.replaceAll(",", "."))
            if(Number.isNaN(number)) return part
            else return ""
        })
        let score = 0
        for(let i = 0; i<comparisonWordList.length; i++) {
            const word1 = comparisonWordList.at(i)
            const word2 = targetWordList.at(i)
            if(!word1 || !word2) continue;
            if(word1.toLowerCase().includes(word2.toLowerCase())) score += 1;
            else return {
                item,
                score
            }
        }
        return {
            item,
            score
        }
    }).sort((a, b) => (a.score - b.score)).reverse()
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
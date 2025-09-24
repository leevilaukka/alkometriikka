import type { ColumnNames } from "$lib/types";
import { filterRenameMap, filterToUnitMarker, sortingOrderDescriptionMap } from "./constants";

export function formatValue(value: string | number, header?: ColumnNames) {
    if(header && Object.hasOwn(filterToUnitMarker, header)) return `${value} ${filterToUnitMarker[header as keyof typeof filterToUnitMarker]}`;
    return value
}

export function headerToUnitMarker(header: ColumnNames) {
    if(Object.hasOwn(filterToUnitMarker, header)) return filterToUnitMarker[header as keyof typeof filterToUnitMarker]
    return ""								
}

export function headerToDisplayName(header: ColumnNames) {
    if(Object.hasOwn(filterRenameMap, header)) return filterRenameMap[header as keyof typeof filterRenameMap];
    return header
}

export function valueToString(value: string | number, header?: ColumnNames) {
    if(!header) return formatValue(value);
    return `${headerToDisplayName(header)}: ${formatValue(value, header)}`
}

export function sortingOrderToString(order: boolean, header?: ColumnNames) {
    if (!header) return order ? "Nouseva" : "Laskeva";
    if (header in sortingOrderDescriptionMap) {
        return order
            ? sortingOrderDescriptionMap[header as keyof typeof sortingOrderDescriptionMap][0]
            : sortingOrderDescriptionMap[header as keyof typeof sortingOrderDescriptionMap][1];
    }
    return order ? "Nouseva" : "Laskeva";
}

export function productIdsToDataset(table: string[][], productIds: string[]) {
    return [table[0], ...table.filter(row => productIds.includes(row[0] as string))];
}
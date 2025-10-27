import { dev } from "$app/environment";
import { lists, personalInfo } from "$lib/global.svelte";
import type { ColumnNames } from "$lib/types";
import { filterRenameMap, filterToUnitMarker, LocalStorageKeys, sortingOrderDescriptionMap } from "./constants";

export function formatValue(value: string | number, header?: ColumnNames) {
    if (header && Object.hasOwn(filterToUnitMarker, header)) return `${value} ${filterToUnitMarker[header as keyof typeof filterToUnitMarker]}`;
    return value
}

export function headerToUnitMarker(header: ColumnNames) {
    if (Object.hasOwn(filterToUnitMarker, header)) return filterToUnitMarker[header as keyof typeof filterToUnitMarker]
    return ""
}

export function headerToDisplayName(header: ColumnNames) {
    if (Object.hasOwn(filterRenameMap, header)) return filterRenameMap[header as keyof typeof filterRenameMap];
    return header
}

export function valueToString(value: string | number, header?: ColumnNames) {
    if (!header) return formatValue(value);
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

const baseTitle = "Alkometriikka" as const;

export function generateTitle(text?: string): string {
    if (dev) {
        return (text
            ? `${text} - ${baseTitle} [dev]`
            : `${baseTitle} [dev]`);
    } else {
        return (text
            ? `${text} - ${baseTitle}`
            : baseTitle)
    }
}

const temp = generateTitle("");

export function handleExport() {
    const data = {
        personalInfo: personalInfo,
        lists: lists
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `alkometriikka-tiedot-${new Date()
        .toISOString()
        .slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

export function handleImport() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (event) => {
        const file = (event?.target as HTMLInputElement)?.files?.[0];
        if (file) {
            const text = await file.text();
            const data = JSON.parse(text);
            const currentPersonalInfo = { ...personalInfo };
            const currentLists = [...lists];
            localStorage.setItem(
                LocalStorageKeys.PersonalInfo,
                JSON.stringify({
                    ...currentPersonalInfo,
                    ...data.personalInfo
                })
            );
            localStorage.setItem(
                LocalStorageKeys.Lists,
                JSON.stringify([...currentLists, ...data.lists])
            );
            window.location.reload();
        }
    };
    input.click();
}

export function handleClearAll() {
    if (
        confirm(
            'Haluatko varmasti tyhjentää kaikki tallennetut tiedot? Tätä toimintoa ei voi perua.'
        )
    ) {
        localStorage.clear();
        window.location.reload();
    }
}

export function getRandom() {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
        return crypto.randomUUID();
    }
    return Math.random().toString(36).substring(2, 10);
}

export async function handleShare({ title, text, url }: { title: string; text: string; url: string }): Promise<boolean> {
    if (navigator.canShare && navigator.canShare({ url })) {
        await navigator.share({
            title,
            text,
            url
        });
        return true;
    } else await navigator.clipboard.writeText(url);
    return false;
}

export function mergeFilterParameters(oldParameters: URLSearchParams, newParameters: URLSearchParams, filterValues: Record<ColumnNames, any[]>) {
    oldParameters = new URLSearchParams([...oldParameters.entries()].filter(([key, value]) => {
        // TODO: Make this better
        return !Object.hasOwn(filterValues, key)
    }))
    const merged = oldParameters
    for (const [key, value] of newParameters.entries()) {
        if (merged.has(key)) {
            const existingValues = merged.getAll(key);
            if (!existingValues.includes(value)) {
                merged.append(key, value);
            }
        } else {
            merged.append(key, value);
        }
    }
    return merged;
}

export function isNullish(value: unknown) {
    return value === null || value === undefined || value === "";
}

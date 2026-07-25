import { dev } from "$app/environment";
import { lists, personalInfo } from "$lib/global.svelte";
import type { ColumnNames, OGImage, OgProperties, TwitterProperties } from "$lib/types";
import { defaultSEOData, filterRenameMap, filterToUnitMarker, LocalStorageKeys, sortingOrderDescriptionMap } from "./constants";


/**
 * Formats a value based on its type and the column header.
 * @param value The value to format.
 * @param header The column header for context.
 * @returns The formatted value.
 */

export function formatValue(value: string | number | boolean | Set<string>, header?: ColumnNames) {
    if (value instanceof Set) return Array.from(value).join(', ');
    if (value === Infinity || value === -Infinity) value = "∞";
    if (header && Object.hasOwn(filterToUnitMarker, header)) return `${value} ${filterToUnitMarker[header as keyof typeof filterToUnitMarker]}`;
    return value
}

/**
 * Returns the unit marker (l, g, etc.) for a given column header.
 * @param header The column header for context.
 * @returns The unit marker for the specified header.
 * If the header is not found in the filterToUnitMarker mapping, it returns an empty string.
 */

export function headerToUnitMarker(header: ColumnNames) {
    if (Object.hasOwn(filterToUnitMarker, header)) return filterToUnitMarker[header as keyof typeof filterToUnitMarker]
    return ""
}

/**
 * Converts a column header to a more user-friendly display name.
 * @param header The column header to convert.
 * @returns The display name for the specified header.
 * If the header is not found in the filterRenameMap, it returns the original header.
 */

export function headerToDisplayName(header: ColumnNames) {
    if (Object.hasOwn(filterRenameMap, header)) return filterRenameMap[header as keyof typeof filterRenameMap];
    return header
}

/**
 * Formats a value into a string representation, optionally including the column header. Used for displaying values in the UI.
 * @param value The value to format.
 * @param header The column header for context.
 * @returns The formatted string.
 */

export function valueToString(value: string | number | boolean | Set<string>, header?: ColumnNames) {
    if (!header) return String(formatValue(value));
    return `${headerToDisplayName(header)}: ${formatValue(value, header)}`
}

/**
 * Converts the sorting order to a string representation.
 * @param order a boolean indicating the sorting order (true for ascending, false for descending)
 * @param header an optional column name to provide context for the sorting order
 * @returns a string representation of the sorting order, if no header is provided, it returns "Nouseva" for ascending and "Laskeva" for descending. If a header is provided and exists in the sortingOrderDescriptionMap, it returns the corresponding description based on the order.
 * If the header is not found in the sortingOrderDescriptionMap, it defaults to "Nouseva" for ascending and "Laskeva" for descending.
 */

export function sortingOrderToString(order: boolean, header?: ColumnNames) {
    if (!header) return order ? "Nouseva" : "Laskeva";
    if (header in sortingOrderDescriptionMap) {
        return order
            ? sortingOrderDescriptionMap[header as keyof typeof sortingOrderDescriptionMap][0]
            : sortingOrderDescriptionMap[header as keyof typeof sortingOrderDescriptionMap][1];
    }
    return order ? "Nouseva" : "Laskeva";
}

/**
 * Filters a dataset to include only rows with the specified product IDs.
 * @param table The dataset to filter.
 * @param productIds The list of product IDs to include.
 * @returns The filtered dataset.
 */

export function productIdsToDataset(table: string[][], productIds: string[]) {
    return [table[0], ...table.filter(row => productIds.includes(row[0] as string))];
}

const baseTitle = "Alkometriikka" as const;

/**
 * Generates a title for the page.
 * @param text An optional string to append to the base title.
 * @returns string The generated title, which includes the base title and the optional text. If in development mode, "[dev]" is appended to the title.
 */

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

/**
 * Handles the export of personal information and lists to a JSON file. The exported file is named with the current date.
 */
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

/**
 * Generates an link to use when linking to external sites. Routes the user through a redirect page that can be used to track clicks and optionally include a referrer parameter.
 * @param url The URL to link to.
 * @param includeReferrer Whether to include the referrer parameter.
 * @returns The generated external link.
 * @deprecated Not really used anymore, but kept for future reference.
 */
export function generateOutLink<U extends string, I extends boolean = false>(url: U, includeReferrer: I = false as I):  `/linkki.html?to=${U}${I extends true ? '&referrer=1' : ''}` {
    const encodedUrl = encodeURIComponent(url);
    let outLink = `/linkki.html?to=${encodedUrl}`;
    if (includeReferrer) {
        outLink += '&referrer=1';
    }
    return outLink as `/linkki.html?to=${U}${I extends true ? '&referrer=1' : ''}`;
}

/**
 * Sends an analytics event. Sends simultaneously to both Simple Analytics and Umami if they are available. In development mode, the event is logged to the console instead of being sent.
 * @param eventName The name of the event.
 * @param eventParams The parameters for the event.
 * @returns void
 */
export function sendAnalyticsEvent(eventName: string, eventParams?: Record<string, any>) {
    if (dev) return console.warn(`Analytics event skipped in dev mode: ${eventName}`, eventParams);

    if (typeof window.sa_event === 'function') {
        window.sa_event(eventName, eventParams);
    }

    if (typeof window.umami === 'object' && typeof window.umami.track === 'function') {
        window.umami.track(eventName, eventParams);
    }
}

/**
 * Handles the import of personal information and lists from a JSON file generated using the `handleExport` function. The imported data is merged with the existing data in localStorage, and the page is reloaded to reflect the changes.
 * @see handleExport
 */
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

/**
 * Clears all data from localStorage and reloads the page after user confirmation. This action is irreversible, so a confirmation dialog is presented to the user before proceeding.
 * @returns void
 */
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

/**
 * Generates a random string to be used as a unique identifier. If the `crypto` API is available (i.e., in a secure context), it uses `crypto.randomUUID()` for a more secure and unique identifier. Otherwise, it falls back to generating a random string using `Math.random()`.
 * @returns random string to be used as a unique identifier.
 */

export function getRandom() {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
        return crypto.randomUUID();
    }
    return Math.random().toString(36).substring(2, 10);
}


/**
 * Handles sharing a URL using the Web Share API if available, or falls back to copying the URL to the clipboard. Sends an analytics event for the share action.
 * @param param0 An object containing the title, text, and URL to share.
 * @returns 
 */
export async function handleShare({ title, text, url }: { title: string; text: string; url: string }): Promise<boolean> {
    if (navigator.canShare && navigator.canShare({ url })) {
        await navigator.share({
            title,
            text,
            url
        });
        return true;
    } else await navigator.clipboard.writeText(url);
    sendAnalyticsEvent('share_list', { url });
    return false;
}


/**
 * Merges two sets of URLSearchParams, ensuring that values from the new parameters are added to the old parameters without duplicating existing values. It also filters out any parameters that are not relevant based on the provided filterValues mapping.
 * @param oldParameters the existing URLSearchParams to merge into.
 * @param newParameters the new URLSearchParams to merge from.
 * @param filterValues a mapping of column names to their allowed values.
 * @returns The merged URLSearchParams containing values from both old and new parameters, with duplicates removed and irrelevant parameters filtered out.
 */
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

/**
 * Checks if a value is nullish (null, undefined, or an empty string). This function is useful for validating input values and ensuring that they are not empty or undefined before processing them further.
 * @param value value to check for nullishness.
 * @returns boolean indicating whether the value is nullish (true) or not (false).
 */
export function isNullish(value: unknown) {
    return value === null || value === undefined || value === "";
}


/**
 * Sets the SEO metadata for the page, including description, Open Graph properties, Twitter card properties, and keywords. This function updates the relevant meta tags in the document head to improve search engine optimization and social media sharing.
 * @param param0 An object containing optional properties for description, Open Graph metadata, Twitter card metadata, and keywords.
 * @returns void
 */
export function setSEO({ description, og, image, twitter, keywords }: { description?: string; og?: OgProperties; image?: OGImage; twitter?: TwitterProperties; keywords?: string }) {
    const metaDescription = document.querySelector('meta[name="description"]');
    const metaKeywords = document.querySelector('meta[name="keywords"]');    

    if (metaDescription && description) {
        metaDescription.setAttribute('content', description);
    }
    if (metaKeywords && keywords) {
        metaKeywords.setAttribute('content', `${keywords}, ${defaultSEOData.keywords}`);
    } else if (metaKeywords) {
        metaKeywords.setAttribute('content', defaultSEOData.keywords);
    }
    if (og) {
        for (const [key, value] of Object.entries(og)) {
            const metaTag = document.querySelector(`meta[property="og:${key}"]`);
            if (metaTag && value) {
                metaTag.setAttribute('content', String(value));
            }
        }
    }
    if (image) {
        const ogImageTag = document.querySelector('meta[property="og:image"]');
        if (ogImageTag && image.url) {
            ogImageTag.setAttribute('content', String(image.url));
        }
        for (const [key, value] of Object.entries(image)) {
            const metaTag = document.querySelector(`meta[property="og:image:${key}"]`);
            if (metaTag && value) {
                metaTag.setAttribute('content', String(value));
            }
        }
    }
    if (twitter) {
        for (const [key, value] of Object.entries(twitter)) {
            const metaTag = document.querySelector(`meta[name="twitter:${key}"]`);
            if (metaTag && value) {
                metaTag.setAttribute('content', String(value));
            }
        }
    }
}

/**
 * Resets the SEO metadata to the default values defined in `defaultSEOData`. This function is useful for restoring the original SEO settings after they have been modified, ensuring that the page's metadata remains consistent with the intended defaults.
 */
export function resetSEO() {
    setSEO(defaultSEOData);
}
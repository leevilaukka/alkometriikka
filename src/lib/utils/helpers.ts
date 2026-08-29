import { dev } from '$app/environment';
import { isFirefox, lists, personalInfo, preferredStoreId } from '$lib/global.svelte';
import { get } from 'svelte/store';
import type {
	AnalyticsEventMap,
	AnalyticsEventName,
	ColumnNames,
	OGImage,
	OgProperties,
	ShareType,
	TwitterProperties
} from '$lib/types';
import {
	defaultSEOData,
	filterRenameMap,
	filterToUnitMarker,
	LocalStorageKeys,
	ShareTypes,
	sortingOrderDescriptionMap,
	AllColumns
} from './constants';
import { formatValue, type FormatOpts } from './format';
import { LocalStorageManager as LocalStorageManager, persistentExportKeys, type LocalStorageKey } from './storage';
import { replaceState } from '$app/navigation';

export function headerToUnitMarker(header: ColumnNames) {
	if (Object.hasOwn(filterToUnitMarker, header))
		return filterToUnitMarker[header as keyof typeof filterToUnitMarker];
	return '';
}

export function headerToDisplayName(header: ColumnNames) {
	if (Object.hasOwn(filterRenameMap, header))
		return filterRenameMap[header as keyof typeof filterRenameMap];
	return header;
}

export function valueToString(
	value: string | number | boolean | Set<string>,
	header?: ColumnNames,
	opts: FormatOpts = { numberFormatOptions: undefined, includeUnit: true }
) {
	if (!header) return String(formatValue(value, undefined, opts));
	return `${headerToDisplayName(header)}: ${formatValue(value, header, opts)}`;
}

export function sortingOrderToString(order: boolean, header?: ColumnNames) {
	if (!header) return order ? 'Nouseva' : 'Laskeva';
	if (header in sortingOrderDescriptionMap) {
		return order
			? sortingOrderDescriptionMap[header as keyof typeof sortingOrderDescriptionMap][0]
			: sortingOrderDescriptionMap[header as keyof typeof sortingOrderDescriptionMap][1];
	}
	return order ? 'Nouseva' : 'Laskeva';
}

export function productIdsToDataset(table: string[][], productIds: string[]) {
	return [table[0], ...table.filter((row) => productIds.includes(row[0] as string))];
}

const baseTitle = 'Alkometriikka' as const;

export function generateTitle(text?: string): string {
	if (dev) {
		return text ? `${text} - ${baseTitle} [dev]` : `${baseTitle} [dev]`;
	} else {
		return text ? `${text} - ${baseTitle}` : baseTitle;
	}
}



export function generateOutLink<U extends string, I extends boolean = false>(
	url: U,
	includeReferrer: I = false as I
): `/linkki.html?to=${U}${I extends true ? '&referrer=1' : ''}` {
	const encodedUrl = encodeURIComponent(url);
	let outLink = `/linkki.html?to=${encodedUrl}`;
	if (includeReferrer) {
		outLink += '&referrer=1';
	}
	return outLink as `/linkki.html?to=${U}${I extends true ? '&referrer=1' : ''}`;
}

export function sendAnalyticsEvent<T extends AnalyticsEventName>(
	eventName: T,
	...args: AnalyticsEventMap[T] extends undefined
		? [params?: undefined]
		: [params: AnalyticsEventMap[T]]
) {
	const [eventParams] = args;
	if (dev) return console.warn(`Analytics event skipped in dev mode: ${eventName}`, eventParams);

	if (typeof window.sa_event === 'function') {
		window.sa_event(eventName, eventParams);
	}
	if (typeof window.umami === 'object' && typeof window.umami.track === 'function') {
		window.umami.track(eventName, eventParams);
	}
}


// Function to handle exporting data to a JSON file, with the option to specify which data to export
export function handleExport(dataToExport: LocalStorageKey[] = persistentExportKeys) {
	const data: Record<string, unknown> = {};

	if (dataToExport) {
		for (const key of dataToExport) {
			data[key] = LocalStorageManager.getItem(key);
		}
		data["exported_at"] = new Date().toISOString();
		data["exported_keys"] = dataToExport;
	}

	const blob = new Blob([JSON.stringify(data, null, 2)], {
		type: 'application/json'
	});
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = `alkometriikka-tiedot-${new Date().toISOString().slice(0, 10)}.json`;
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
			const data = await file.text();
			const jsonData = JSON.parse(data) as Partial<Record<LocalStorageKey | 'exported_at' | 'exported_keys', unknown>>;
			const currentPersonalInfo = { ...personalInfo };
			const currentLists = [...lists];

			for (const key of Object.values(jsonData.exported_keys || [])) {
				console.log(`Importing key: ${key}`);
				if (key === LocalStorageKeys.Lists) {
					const importedLists = jsonData.lists as typeof lists;
					console.log(`Imported lists:`, importedLists);
					if (importedLists) {
						LocalStorageManager.setItem(LocalStorageKeys.Lists, [...currentLists, ...importedLists]);
					}
				} else if (key === LocalStorageKeys.PersonalInfo) {
					const importedPersonalInfo = jsonData.personal_info as typeof personalInfo;
					if (importedPersonalInfo) {
						LocalStorageManager.setItem(LocalStorageKeys.PersonalInfo, {
							...currentPersonalInfo,
							...importedPersonalInfo
						});
					}
				} else {
					LocalStorageManager.setItem(key as LocalStorageKey, jsonData[key as LocalStorageKey] as any);
				}
			}
			window.location.reload();
		}
	};
	input.click();
}

export function handleClearAll() {
	if (
		confirm('Haluatko varmasti tyhjentää kaikki tallennetut tiedot? Tätä toimintoa ei voi perua.')
	) {
		LocalStorageManager.clear();
		window.location.reload();
	}
}

export function getRandom(): string {
	if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
		return crypto.randomUUID();
	}
	return Math.random().toString(36).substring(2, 10);
}

function generateSID() {
	return getRandom().replace(/-/g, '').substring(0, 8);
}

export async function handleShare({
	type = ShareTypes.Default,
	title,
	text,
	url,
	includeSID = false
}: {
	type?: ShareType;
	title: string;
	text: string;
	url: string;
	includeSID?: boolean;
}): Promise<boolean> {
	const sid = includeSID ? generateSID() : undefined;

	const shareUrl = sid ? `${url}${url.includes('?') ? '&' : '?'}sid=${sid}` : url;

	const completeShare = () => {
		if (sid) {
			// Mark this share as already viewed by the sharer so their own visit
			// doesn't count as a shared view.
			LocalStorageManager.appendToArrayItem(LocalStorageKeys.ViewedShares, sid);
		}

		sendAnalyticsEvent(`share_${type}`, {
			url,
			sid
		});
	};

	if (
		navigator.canShare &&
		navigator.canShare({ url: shareUrl }) &&
		!isFirefox // Firefox has a poor implementation of the Web Share API
	) {
		try {
			await navigator.share({
				title,
				text,
				url: shareUrl
			});

			completeShare();
		} catch (err) {
			if ((err as Error).name === 'AbortError') {
				// The user cancelled the share sheet.
				return true;
			}

			throw err;
		}

		return true;
	}

	await navigator.clipboard.writeText(shareUrl);

	completeShare();

	return false;
}

export function trackSharedView(type: ShareType = ShareTypes.Default) {
	const url = new URL(location.href);
	const sid = url.searchParams.get('sid');
	if (sid) {
		const viewedShares = LocalStorageManager.getItem(LocalStorageKeys.ViewedShares) || [];
		url.searchParams.delete('sid');

		if (!viewedShares.includes(sid)) {
			viewedShares.push(sid);
			LocalStorageManager.setItem(LocalStorageKeys.ViewedShares, viewedShares);

			sendAnalyticsEvent(`shared_${type}_viewed`, {
				url: url.href,
				sid
			});
		}

		replaceState(url.href, {});
	}
}

export function mergeFilterParameters(
	oldParameters: URLSearchParams,
	newParameters: URLSearchParams,
	filterValues: Record<ColumnNames, any[]>
) {
	oldParameters = new URLSearchParams(
		[...oldParameters.entries()].filter(([key, value]) => {
			// TODO: Make this better
			return !Object.hasOwn(filterValues, key);
		})
	);
	const merged = oldParameters;
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
	return value === null || value === undefined || value === '';
}

export function setSEO({
	description,
	og,
	image,
	twitter,
	keywords
}: {
	description?: string;
	og?: OgProperties;
	image?: OGImage;
	twitter?: TwitterProperties;
	keywords?: string;
}) {
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

export function resetSEO() {
	setSEO(defaultSEOData);
}

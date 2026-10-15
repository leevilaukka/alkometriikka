import { AllColumns } from '$lib/utils/constants/columns';
import type { ColumnNames } from '$lib/types';
import { locale, m } from '.';

/**
 * Translations of the dataset's Finnish values (categories, countries, taste words…).
 *
 * data.json stays in Finnish: filters, URLs and stored lists all use the Finnish values. The
 * sync writes `labels.<locale>.json` next to it (scripts/i18n/labels.ts), keyed by the
 * lowercased Finnish value, and values are only translated where they're shown. Anything
 * without a translation is shown in Finnish.
 */
let labels: Record<string, string> = {};

/**
 * Product names in the current language, by product number, for the products whose name Alko
 * translates (mostly the packaging word: "tölkki" → "can"). data.json keeps the Finnish names,
 * which the size matching and the daily game rely on.
 */
let names: Record<string, string> = {};

/** Swedish store names by the Finnish name, which is what the store filter's values are. */
const storeNames = new Map<string, string>();

/** Columns whose values are translated when shown. Names, producers and grapes are proper nouns. */
const TRANSLATED_COLUMNS = new Set<ColumnNames>([
	AllColumns.Type,
	AllColumns.SubType,
	AllColumns.BeerType,
	AllColumns.Country,
	AllColumns.Region,
	AllColumns.SpecialGroup,
	AllColumns.Note,
	AllColumns.Description,
	AllColumns.PackagingType,
	AllColumns.SealingType,
	AllColumns.Availability,
	AllColumns.FoodPairings,
	AllColumns.New,
	AllColumns.OnSale
]);

/** Values the app itself fills in, rather than the dataset. */
const APP_VALUES: Record<string, () => string> = {
	'ei määritelty': m.value_not_specified,
	uutuus: m.value_new,
	alennuksessa: m.value_on_sale
};

export function isTranslatedColumn(column: ColumnNames | undefined): boolean {
	if (column === AllColumns.StoreAvailability) return storeNames.size > 0;
	return column !== undefined && TRANSLATED_COLUMNS.has(column);
}

/** Registers the stores' Swedish names (`name_sv`) for showing the store filter's values. */
export function registerStoreNames(stores: Iterable<{ name: string; name_sv?: string }>) {
	if (locale !== 'sv') return;
	for (const store of stores) {
		if (store.name_sv?.trim() && store.name_sv !== store.name)
			storeNames.set(store.name, store.name_sv);
	}
}

/** Loads the value translations for the current language. Finnish needs none. */
export async function loadValueLabels(
	fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
	url: string
) {
	if (locale === 'fi') return;
	try {
		const response = await fetch(url);
		if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
		const file = (await response.json()) as {
			labels?: Record<string, string>;
			names?: Record<string, string>;
		};
		labels = file.labels ?? {};
		names = file.names ?? {};
	} catch (error) {
		// The values are shown in Finnish instead
		console.warn('Failed to load value translations', error);
	}
}

function lookup(value: string): string | undefined {
	const key = value.trim().toLowerCase();
	return APP_VALUES[key]?.() ?? labels[key];
}

type NamedProduct = {
	[AllColumns.Number]?: unknown;
	[AllColumns.Name]?: unknown;
	[AllColumns.PackagingType]?: unknown;
};

/**
 * A product's name in the current language: Alko's own translation, or for products it no
 * longer lists (removed ones), the Finnish name with its trailing packaging word translated
 * ("Lager tölkki" → "Lager can"), which is how most of Alko's translated names differ.
 */
export function productName(product: NamedProduct): string;
export function productName(product: NamedProduct | undefined): string | undefined;
export function productName(product: NamedProduct | undefined): string | undefined {
	if (!product) return undefined;
	const name = product[AllColumns.Name];
	const finnish = typeof name === 'string' ? name : '';
	if (locale === 'fi') return finnish;
	const translated = names[String(product[AllColumns.Number])];
	if (translated) return translated;
	const packaging = product[AllColumns.PackagingType];
	if (typeof packaging !== 'string' || !packaging) return finnish;
	const suffix = ` ${packaging.toLowerCase()}`;
	const packagingLabel = labels[packaging.trim().toLowerCase()];
	if (!packagingLabel || !finnish.toLowerCase().endsWith(suffix)) return finnish;
	return `${finnish.slice(0, -suffix.length)} ${packagingLabel}`;
}

/** Keeps the source's leading capital: data values are capitalized when they're parsed. */
function matchCase(source: string, translated: string): string {
	const first = source.trimStart().charAt(0);
	if (first && first !== first.toLowerCase()) {
		return translated.charAt(0).toLocaleUpperCase(locale) + translated.slice(1);
	}
	return translated;
}

/**
 * A dataset value in the current language. Pass the column to skip columns that aren't
 * translated (e.g. product names that happen to match a category).
 */
export function translateValue(value: string, column?: ColumnNames): string {
	if (locale === 'fi' || !value) return value;
	if (column === AllColumns.StoreAvailability) return storeNames.get(value) ?? value;
	if (column !== undefined && !TRANSLATED_COLUMNS.has(column)) return value;
	// Regions are "<region> - <appellation>": only the region has a translation
	if (column === AllColumns.Region) {
		const [region, ...rest] = value.split(' - ');
		const translated = lookup(region);
		return translated ? [matchCase(region, translated), ...rest].join(' - ') : value;
	}
	const translated = lookup(value);
	return translated ? matchCase(value, translated) : value;
}

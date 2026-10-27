import { CryptoHasher } from 'bun';
import { formatFoodPairings } from '../../src/lib/utils/catalog/food.ts';
import { STALE_ARRIVAL_STATUS } from '../../src/lib/utils/catalog/status.ts';

export const LEGACY_HEADERS = [
	'Numero',
	'Nimi',
	'Valmistaja',
	'Pullokoko',
	'Hinta',
	'Litrahinta',
	'Uutuus',
	'Hinnastojärjestyskoodi',
	'Tyyppi',
	'Alatyyppi',
	'Erityisryhmä',
	'Oluttyyppi',
	'Valmistusmaa',
	'Alue',
	'Vuosikerta',
	'Etikettimerkintöjä',
	'Huomautus',
	'Rypäleet',
	'Luonnehdinta',
	'Pakkaustyyppi',
	'Suljentatyyppi',
	'Alkoholi-%',
	'Hapot g/l',
	'Sokeri g/l',
	'Kantavierrep-%',
	'Väri EBC',
	'Katkerot EBU',
	'Energia kcal/100 ml',
	'Valikoima',
	'EAN',
	'Normaalihinta',
	'Kampanja alkaa',
	'Kampanja päättyy',
	'Ruokasuositukset',
	'Tila',
	'Pantti'
] as const;

export const DEV = process.argv.includes('--dev');

/**
 * Main groups that are not actual drinks (gifts & drinking accessories) and
 * should never end up in the dataset.
 */
export const IRRELEVANT_MAIN_GROUP_IDS: ReadonlySet<string> = new Set(['mainGroup_002']);
export const IRRELEVANT_MAIN_GROUP_NAMES: ReadonlySet<string> = new Set([
	'lahja- ja juomatarvikkeet'
]);

/** Column index of the main-group name ("Tyyppi") inside a legacy `values` array. */
const TYYPPI_INDEX = LEGACY_HEADERS.indexOf('Tyyppi');

// Alko API constants and helpers are shared between setup scripts, so that
// they can be updated in one place if the API changes.
const API_BASE_URL = 'https://www.alko.fi/api';

export const SEARCH_URL = `${API_BASE_URL}/search/product`;
export const STORES_URL = `${API_BASE_URL}/stores`;
export const productDetailsUrl = <ID extends string>(id: ID) =>
	`${API_BASE_URL}/product-api/products/${id}` as const;

/** Request headers to be used for Alko API calls.
 * The User-Agent is set to a recent Firefox on Linux to avoid 403s.
 */
export const REQUEST_HEADERS: Record<string, string> = {
	Accept: 'application/json',
	'Content-Type': 'application/json',
	'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:147.0) Gecko/20100101 Firefox/147.0'
};

/** Normalizes an unknown field into a list of trimmed strings. */
function toStringList(value: unknown): string[] {
	if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
	return typeof value === 'string' ? [value] : [];
}

/**
 * Normalizes a word list column (Luonnehdinta, Ruokasuositukset): a comma separated string is
 * split, words are trimmed and empty ones dropped, and with `lowercase` the words lose their
 * sentence case too (the app capitalizes words itself). Null when no words are left.
 */
function toWordList(value: unknown, lowercase: boolean): string[] | null {
	const words = (typeof value === 'string' ? value.split(',') : toStringList(value))
		.map((word) => (lowercase ? word.trim().toLowerCase() : word.trim()))
		.filter(Boolean);
	return words.length ? words : null;
}

/**
 * Turns the search API's `certificateClass` entries (`certificateId|certificate_001|Luomu`)
 * into a comma separated list of their labels, e.g. `Luomu, Vegaaneille soveltuva tuote`.
 */
function formatCertificates(value: unknown): string | null {
	const labels = toStringList(value)
		.map((entry) => entry.split('|')[2]?.trim())
		.filter((label): label is string => Boolean(label));
	return labels.length ? [...new Set(labels)].join(', ') : null;
}

/**
 * Labels for the search API's `statusId` codes, matching the Finnish `status`
 * the detail API reports for the same products (except `U`, which the detail
 * API calls "Uusi" but the dataset has always called "Uutuus"). Status `K`
 * (Kuoletettu, discontinued) never reaches the search API.
 */
export const STATUS_LABELS: Readonly<Record<string, string>> = {
	A: 'Aktiivinen',
	P: 'Poistuva',
	U: 'Uutuus',
	X: 'Tulee'
};

/** Label of a `statusId`. Unknown codes are kept as-is so a new one shows up instead of vanishing. */
export function formatStatus(value: unknown): string | null {
	if (typeof value !== 'string' || !value.trim()) return null;
	return STATUS_LABELS[value.trim()] ?? value.trim();
}

/** Converts an unknown field into a finite number or null. Handles the string prices the API returns. */
function toPriceNumber(value: unknown): number | null {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string') {
		const normalized = Number(value.replace(',', '.').trim());
		if (Number.isFinite(normalized)) return normalized;
	}
	return null;
}

/**
 * True when a raw search/detail product belongs to an irrelevant main group,
 * matched either by `mainGroupId` or `mainGroupName`.
 */
export function isIrrelevantMainGroup(source: {
	mainGroupId?: unknown;
	mainGroupName?: unknown;
}): boolean {
	const ids = toStringList(source.mainGroupId);
	const names = toStringList(source.mainGroupName);
	return (
		ids.some((id) => IRRELEVANT_MAIN_GROUP_IDS.has(id.trim())) ||
		names.some((name) => IRRELEVANT_MAIN_GROUP_NAMES.has(name.trim().toLowerCase()))
	);
}

/**
 * True when a stored legacy `values` array belongs to an irrelevant main group,
 * matched by its "Tyyppi" column.
 */
export function isIrrelevantStoredValues(values: unknown[]): boolean {
	const tyyppi = values[TYYPPI_INDEX];
	return typeof tyyppi === 'string' && IRRELEVANT_MAIN_GROUP_NAMES.has(tyyppi.trim().toLowerCase());
}

export type ProductFieldMapping = {
	newPropertyKey: string;
	legacyKey: (typeof LEGACY_HEADERS)[number];
	usedForHashing: boolean;
	preprocessor: (value: unknown) => unknown;
};

const findRegionFromSites = (sites: unknown) => {
	if (!Array.isArray(sites)) {
		return null;
	}

	const region = sites.find((site) => {
		if (!site || typeof site !== 'object') {
			return false;
		}

		const searchParams = (site as { searchParams?: { regionId?: unknown } }).searchParams;
		return searchParams?.regionId !== undefined && searchParams?.regionId !== null;
	}) as { label?: unknown; value?: unknown } | undefined;

	if (!region) {
		return null;
	}

	const label = typeof region.label === 'string' ? region.label : null;
	const value = typeof region.value === 'string' ? region.value : null;

	if (label && value) {
		return `${label} - ${value}`;
	}

	return value;
};

export const FIELD_TO_LEGACY_SCHEMA: ProductFieldMapping[] = [
	{
		newPropertyKey: 'id',
		legacyKey: 'Numero',
		usedForHashing: false,
		preprocessor: (value) => value
	},
	{
		newPropertyKey: 'name',
		legacyKey: 'Nimi',
		usedForHashing: true,
		preprocessor: (value) => value
	},
	{
		newPropertyKey: 'producer',
		legacyKey: 'Valmistaja',
		usedForHashing: false,
		preprocessor: (value) => value
	},
	{
		newPropertyKey: 'volume',
		legacyKey: 'Pullokoko',
		usedForHashing: false,
		preprocessor: (value) => value
	},
	{
		newPropertyKey: 'price',
		legacyKey: 'Hinta',
		usedForHashing: true,
		preprocessor: (value) => value
	},
	{
		newPropertyKey: 'pricePerLitre',
		legacyKey: 'Litrahinta',
		usedForHashing: false,
		preprocessor: toPriceNumber
	},
	{
		newPropertyKey: 'statusId',
		legacyKey: 'Uutuus',
		usedForHashing: true,
		preprocessor: (statusId) => (statusId === 'U' ? 'Uutuus' : null)
	},
	{
		newPropertyKey: 'id',
		legacyKey: 'Hinnastojärjestyskoodi',
		usedForHashing: false,
		preprocessor: () => null
	},
	{
		newPropertyKey: 'mainGroup',
		legacyKey: 'Tyyppi',
		usedForHashing: false,
		preprocessor: (value) => value
	},
	{
		newPropertyKey: 'category',
		legacyKey: 'Alatyyppi',
		usedForHashing: false,
		preprocessor: (value) => value
	},
	{
		newPropertyKey: 'certificateClass',
		legacyKey: 'Erityisryhmä',
		usedForHashing: false,
		preprocessor: formatCertificates
	},
	{
		newPropertyKey: 'flavorTag',
		legacyKey: 'Oluttyyppi',
		usedForHashing: false,
		preprocessor: (value) =>
			value && typeof value === 'object' ? (value as { text?: unknown }).text : null
	},
	{
		newPropertyKey: 'countryName',
		legacyKey: 'Valmistusmaa',
		usedForHashing: false,
		preprocessor: (value) => value
	},
	{
		newPropertyKey: 'productionSites',
		legacyKey: 'Alue',
		usedForHashing: false,
		preprocessor: findRegionFromSites
	},
	{
		newPropertyKey: 'vintage',
		legacyKey: 'Vuosikerta',
		usedForHashing: false,
		preprocessor: (value) => value
	},
	{
		newPropertyKey: 'id',
		legacyKey: 'Etikettimerkintöjä',
		usedForHashing: false,
		preprocessor: () => null
	},
	{
		newPropertyKey: 'moreInfo',
		legacyKey: 'Huomautus',
		usedForHashing: false,
		preprocessor: (value) => value
	},
	{
		newPropertyKey: 'grapeVarieties',
		legacyKey: 'Rypäleet',
		usedForHashing: false,
		preprocessor: (grapes) =>
			Array.isArray(grapes)
				? grapes
						.map((grape) =>
							grape && typeof grape === 'object' ? (grape as { label?: unknown }).label : ''
						)
						.join(', ')
				: null
	},
	{
		newPropertyKey: 'taste',
		legacyKey: 'Luonnehdinta',
		usedForHashing: true,
		preprocessor: (value) => toWordList(value, true)
	},
	{
		newPropertyKey: 'packageTypes',
		legacyKey: 'Pakkaustyyppi',
		usedForHashing: false,
		preprocessor: (value) =>
			Array.isArray(value)
				? (value.join('|').split('|')[2] ?? null)
				: typeof value === 'string'
					? (value.split('|')[2] ?? null)
					: null
	},
	{
		newPropertyKey: 'closures',
		legacyKey: 'Suljentatyyppi',
		usedForHashing: false,
		preprocessor: (value) =>
			Array.isArray(value)
				? (value.join('|').split('|')[2] ?? null)
				: typeof value === 'string'
					? (value.split('|')[2] ?? null)
					: null
	},
	{
		newPropertyKey: 'abv',
		legacyKey: 'Alkoholi-%',
		usedForHashing: true,
		preprocessor: (value) => value
	},
	{
		newPropertyKey: 'acidPerLitre',
		legacyKey: 'Hapot g/l',
		usedForHashing: false,
		preprocessor: (value) => value
	},
	{
		newPropertyKey: 'sugarPerLitre',
		legacyKey: 'Sokeri g/l',
		usedForHashing: false,
		preprocessor: (value) => value
	},
	{
		newPropertyKey: 'beerWortPlato',
		legacyKey: 'Kantavierrep-%',
		usedForHashing: false,
		preprocessor: (value) => value
	},
	{ newPropertyKey: 'id', legacyKey: 'Väri EBC', usedForHashing: false, preprocessor: () => null },
	{
		newPropertyKey: 'beerBitternessEbu',
		legacyKey: 'Katkerot EBU',
		usedForHashing: false,
		preprocessor: (value) => value
	},
	{
		newPropertyKey: 'nutrition',
		legacyKey: 'Energia kcal/100 ml',
		usedForHashing: false,
		preprocessor: (value) =>
			value && typeof value === 'object'
				? (value as { kiloCaloriesPerDL?: unknown }).kiloCaloriesPerDL
				: null
	},
	{
		newPropertyKey: 'selectionTypes',
		legacyKey: 'Valikoima',
		usedForHashing: true,
		preprocessor: (value) =>
			Array.isArray(value)
				? (value.join('|').split('|')[2] ?? null)
				: typeof value === 'string'
					? (value.split('|')[2] ?? null)
					: null
	},
	{ newPropertyKey: 'id', legacyKey: 'EAN', usedForHashing: false, preprocessor: () => null },
	{
		newPropertyKey: 'lowest_30d_price',
		legacyKey: 'Normaalihinta',
		usedForHashing: true,
		preprocessor: toPriceNumber
	},
	{
		newPropertyKey: 'campaign_start_date',
		legacyKey: 'Kampanja alkaa',
		usedForHashing: true,
		preprocessor: (value) => value ?? null
	},
	{
		newPropertyKey: 'campaign_end_date',
		legacyKey: 'Kampanja päättyy',
		usedForHashing: true,
		preprocessor: (value) => value ?? null
	},
	{
		newPropertyKey: 'foodSymbolId',
		legacyKey: 'Ruokasuositukset',
		usedForHashing: false,
		preprocessor: formatFoodPairings
	},
	{
		newPropertyKey: 'statusId',
		legacyKey: 'Tila',
		usedForHashing: true,
		preprocessor: formatStatus
	},
	{
		// Euros, included in the price but not in `pricePerLitre`. Detail API only,
		// and missing for some products that clearly have one (e.g. some cans).
		newPropertyKey: 'deposit',
		legacyKey: 'Pantti',
		usedForHashing: false,
		preprocessor: (value) => {
			const deposit = toPriceNumber(value);
			return deposit !== null && deposit > 0 ? deposit : null;
		}
	}
];

/**
 * Search-API columns refreshed on every sync, even for products whose hash is
 * unchanged. They aren't hashed (a change shouldn't cost a detail fetch), so
 * without this they'd only update when something else about the product changes.
 */
export const SEARCH_REFRESHED_COLUMNS: readonly (typeof LEGACY_HEADERS)[number][] = [
	'Erityisryhmä',
	'Ruokasuositukset'
];

/**
 * Builds a legacy-ordered value array from an API product object by running each
 * schema entry's `preprocessor` over the matching `newPropertyKey`.
 *
 * The resulting array is aligned to {@link LEGACY_HEADERS} order and is the
 * canonical `values` payload stored on disk for every product.
 */
export function buildLegacyValues(source: Record<string, unknown>): unknown[] {
	return FIELD_TO_LEGACY_SCHEMA.map(
		(field) => field.preprocessor(source[field.newPropertyKey]) ?? null
	);
}

/**
 * Ensures a stored legacy `values` array lines up with the current schema.
 *
 * When the schema gains columns (e.g. the campaign/normal-price fields), rows
 * carried over from an older dataset are shorter than `LEGACY_HEADERS`. If left
 * as-is, every such row would be misaligned in the app (the appended
 * "Hintahistoria" and "Poistunut valikoimasta" columns would land in the wrong
 * positions). Padding/truncating on load keeps every row aligned.
 */
export function alignValues(values: unknown[]): unknown[] {
	if (values.length === LEGACY_HEADERS.length) return values;
	if (values.length < LEGACY_HEADERS.length) {
		return [...values, ...Array(LEGACY_HEADERS.length - values.length).fill(null)];
	}
	return values.slice(0, LEGACY_HEADERS.length);
}

const SPECIAL_GROUP_INDEX = LEGACY_HEADERS.indexOf('Erityisryhmä');

/** Word list columns and whether their words are lowercased, see `toWordList` */
const WORD_LIST_COLUMNS = [
	[LEGACY_HEADERS.indexOf('Luonnehdinta'), true],
	[LEGACY_HEADERS.indexOf('Ruokasuositukset'), false]
] as const;

/**
 * Converts values stored in an older format to the current one:
 * - Erityisryhmä used to be a vegan flag (certificate_005), now it's the label
 *   list built by `formatCertificates`.
 * - Luonnehdinta used to keep the space after each comma and its sentence case,
 *   and the legacy XLSX rows have it as one string. Ruokasuositukset used to be
 *   its labels joined with ", ". Both are now lists from `toWordList`.
 *
 * Products still in the selection get refreshed from the search API anyway, so
 * this mostly matters for removed ones.
 */
export function upgradeStoredValues(values: unknown[]): unknown[] {
	const upgrades: [number, unknown][] = [];
	const specialGroup = values[SPECIAL_GROUP_INDEX];
	if (typeof specialGroup === 'boolean')
		upgrades.push([SPECIAL_GROUP_INDEX, specialGroup ? 'Vegaaneille soveltuva tuote' : null]);
	for (const [index, lowercase] of WORD_LIST_COLUMNS) {
		const value = values[index];
		if (typeof value !== 'string' && !Array.isArray(value)) continue;
		const words = toWordList(value, lowercase);
		if (JSON.stringify(words) !== JSON.stringify(value)) upgrades.push([index, words]);
	}
	if (!upgrades.length) return values;
	const upgraded = [...values];
	for (const [index, value] of upgrades) upgraded[index] = value;
	return upgraded;
}

/**
 * Version of the change-detection hash algorithm and its hashed field set.
 *
 * Bump this whenever a `usedForHashing` column is added/removed/renamed, a
 * hashed column's `preprocessor` changes, or the hash canonicalization changes.
 * `rehash.ts` uses it to decide whether stored hashes need rewriting, and the
 * sync persists it in the dataset metadata. Do not bump it for unrelated
 * schema additions (appended columns don't affect hashed indices).
 */
export const HASH_VERSION = 3;

const STATUS_INDEX = LEGACY_HEADERS.indexOf('Tila');

/**
 * Extracts only the change-detection relevant values (`usedForHashing`) from a
 * legacy-ordered value array, preserving their column order.
 */
export function getHashValues(values: unknown[]): unknown[] {
	return FIELD_TO_LEGACY_SCHEMA.map((field, index) => ({ field, index }))
		.filter(({ field }) => field.usedForHashing)
		.map(({ index }) =>
			// The sync derives the stale arrival status after hashing (see markStaleArrivals),
			// so it hashes as the "Tulee" the search API reports. Otherwise stored values
			// would hash differently from the search payload after a rehash.
			index === STATUS_INDEX && values[index] === STALE_ARRIVAL_STATUS
				? STATUS_LABELS.X
				: values[index]
		);
}

/**
 * Produces an order-independent representation of a hashed value. Array-valued
 * fields (e.g. `taste`/Luonnehdinta) are trimmed and sorted so that the same
 * set of entries in a different source order hashes identically, preventing
 * spurious "changed" detections that trigger unnecessary detail re-fetches.
 */
function canonicalizeHashValue(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map((item) => (typeof item === 'string' ? item.trim() : item)).sort();
	}
	return value;
}

/** Computes a stable SHA-256 hex hash over the given values. */
export function getHash(values: unknown[]): string {
	const hasher = new CryptoHasher('sha256');
	hasher.update(JSON.stringify(values.map(canonicalizeHashValue)));
	return hasher.digest('hex');
}

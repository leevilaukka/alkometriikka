/**
 * Read-only query layer over the Alkometriikka catalog, used by the MCP tools.
 *
 * Everything product-related is delegated to the web app's own code: `Kaljakori`
 * normalises the dataset and computes the alcohol/value metrics
 * (`calculateDrunkValue`), and search/filtering goes through
 * `Kaljakori.fuzzySearchAndFilter`, so results match what alkometriikka.fi shows.
 * This module only translates between that representation and compact,
 * English-keyed objects suitable for an LLM.
 */
import { Kaljakori } from '../src/lib/alko/index.ts';
import type {
	AvailabilityData,
	AvailabilityStore,
	ColumnNames,
	PriceHistoryEntry,
	PriceListItem
} from '../src/lib/types.ts';
import { AllColumns } from '../src/lib/utils/constants.ts';
import { getSaleInfo } from '../src/lib/utils/sales.ts';
import { similarity } from '../src/lib/utils/search.ts';
import {
	activeProducts,
	bestValueRanks,
	categoryDistribution,
	computeSummary
} from '../src/lib/utils/stats.ts';
import { getStoreCity, getTodaysOpeningHours, isStoreOpen } from '../src/lib/utils/availability.ts';
import { generateImageUrl } from '../src/lib/utils/image.ts';

/** An error caused by the tool arguments (unknown product, unknown filter value, ...). */
export class ToolInputError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ToolInputError';
	}
}

export type DatasetStatus = {
	/** When the product data last changed (dataset `LastUpdated`). */
	last_updated: string | null;
	/** When Alkometriikka last checked Alko for changes (dataset `LastSynced`). */
	last_synced: string | null;
	availability_last_updated: string | null;
	/** When this server downloaded (or last revalidated) its local copy. */
	downloaded_at: string | null;
	source: string;
	/** True when the latest refresh failed and older cached data is served. */
	stale: boolean;
	warnings?: string[];
};

/** Filterable categorical fields, mapped to their dataset columns. */
export const FILTER_FIELDS = {
	category: AllColumns.Type,
	subcategory: AllColumns.SubType,
	style: AllColumns.BeerType,
	country: AllColumns.Country,
	region: AllColumns.Region,
	manufacturer: AllColumns.Manufacturer,
	packaging: AllColumns.PackagingType,
	selection: AllColumns.Availability,
	grape: AllColumns.GrapeVarieties,
	taste_descriptor: AllColumns.Description
} as const satisfies Record<string, ColumnNames>;

export type FilterField = keyof typeof FILTER_FIELDS | 'store';

/** Set-valued columns match with AND semantics in `Kaljakori` (the product must have every value). */
const SET_FIELDS = new Set<FilterField>(['grape', 'taste_descriptor']);

export const SORT_KEYS = {
	relevance: null,
	alcohol_grams_per_euro: { column: AllColumns.AlcoholGramsPerEuro, ascending: false },
	price: { column: AllColumns.Price, ascending: true },
	price_per_liter: { column: AllColumns.PricePerLiter, ascending: true },
	euro_per_liter_alcohol: { column: AllColumns.EuroPerLiterAlcohol, ascending: true },
	alcohol_percentage: { column: AllColumns.AlcoholPercentage, ascending: false },
	bottle_size: { column: AllColumns.BottleSize, ascending: true },
	name: { column: AllColumns.Name, ascending: true }
} as const;

export type SortKey = keyof typeof SORT_KEYS;

export type SearchParams = {
	query?: string;
	category?: string[];
	subcategory?: string[];
	style?: string[];
	country?: string[];
	region?: string[];
	manufacturer?: string[];
	packaging?: string[];
	selection?: string[];
	grapes?: string[];
	taste_descriptors?: string[];
	store?: string[];
	min_price?: number;
	max_price?: number;
	min_alcohol_percentage?: number;
	max_alcohol_percentage?: number;
	min_bottle_size_l?: number;
	max_bottle_size_l?: number;
	max_sugar_g_per_l?: number;
	on_sale?: boolean;
	include_removed?: boolean;
	sort_by?: SortKey;
	sort_order?: 'asc' | 'desc';
	limit?: number;
	offset?: number;
};

export const SEARCH_LIMIT_DEFAULT = 10;
export const SEARCH_LIMIT_MAX = 50;
export const COMPARE_MAX = 10;

const METRICS_NOTE =
	'Metrics are computed with the same formulas as alkometriikka.fi: alcohol_grams = volume × ABV × 789 g/l ' +
	'ethanol density; a standard drink is 12 g of alcohol; euro_per_liter_alcohol is the price of one liter of ' +
	'pure alcohol. estimated_promille is a rough Widmark estimate for drinking the whole package, for a 79 kg ' +
	'reference person (r = 0.55); it is not medical or driving advice.';

const AVAILABILITY_LIMITATIONS = [
	'Store availability is a snapshot from Alko product search, refreshed by Alkometriikka roughly every 6 hours; see availability_last_updated.',
	'A listed store carried the product at snapshot time. Stock quantities are not known, and the product may have sold out since.',
	'Products that are not listed in any store may still be orderable (e.g. tilausvalikoima) or sold in Alko’s online shop.',
	'open_now and opening_hours_today are based on published opening hours in Finnish time (Europe/Helsinki).'
];

const normalize = (value: string) => value.trim().toLocaleLowerCase('fi');

function text(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	if (!trimmed || trimmed === 'Null' || trimmed === 'Undefined') return null;
	return trimmed;
}

function num(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Beer measurements are 0 rather than missing for other products; report those as unknown. */
function measurement(value: unknown): number | null {
	return num(value) || null;
}

/** The area part of a region value ("Champagne - AC Champagne" → "champagne"). */
const regionArea = (value: string) => normalize(value.split(' - ')[0]!);

function list(value: unknown): string[] {
	return value instanceof Set ? [...value].filter((v): v is string => typeof v === 'string') : [];
}

function round(value: number, digits = 2): number {
	const factor = 10 ** digits;
	return Math.round(value * factor) / factor;
}

/**
 * Accepts a plain product number ("319027"), or an alko.fi / alkometriikka.fi
 * product URL, and returns the product number.
 */
export function parseProductId(input: string): string | null {
	const trimmed = input.trim();
	const fromUrl = trimmed.match(/tuotteet\/(\d+)/);
	if (fromUrl) return fromUrl[1]!;
	return /^\d+$/.test(trimmed) ? trimmed : null;
}

/**
 * Merges values that differ only in case or surrounding whitespace (Alko's data has
 * e.g. "AC Champagne" and "AC CHampagne "), keeping the most common spelling. Filtering
 * with any spelling already matches all variants.
 */
function mergeSpellingVariants(values: { value: string; count: number }[]) {
	const merged = new Map<string, { value: string; count: number; top: number }>();
	for (const { value, count } of values) {
		const key = normalize(value);
		const entry = merged.get(key);
		if (!entry) merged.set(key, { value: value.trim(), count, top: count });
		else {
			entry.count += count;
			if (count > entry.top) Object.assign(entry, { value: value.trim(), top: count });
		}
	}
	return [...merged.values()]
		.map(({ value, count }) => ({ value, count }))
		.sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, 'fi'));
}

export class Catalog {
	readonly kaljakori: Kaljakori;
	status: DatasetStatus;

	constructor(
		table: any[],
		readonly availability: AvailabilityData,
		status: DatasetStatus,
		private readonly siteUrl = 'https://alkometriikka.fi'
	) {
		this.kaljakori = new Kaljakori(table, undefined, availability);
		this.status = status;
	}

	// ------------------------------------------------------------------------
	// Lookup
	// ------------------------------------------------------------------------

	findProduct(input: string): PriceListItem | undefined {
		const id = parseProductId(input);
		if (!id) return undefined;
		// Product numbers are 6 digits with leading zeros; tolerate them being dropped.
		return this.kaljakori.findById(id) ?? this.kaljakori.findById(id.padStart(6, '0'));
	}

	requireProduct(input: string): PriceListItem {
		const product = this.findProduct(input);
		if (product) return product;
		throw new ToolInputError(
			parseProductId(input)
				? `No product with ID "${input}" exists in the Alkometriikka catalog. Use search_products to find product IDs.`
				: `"${input}" is not a valid product ID. Product IDs are numeric Alko product numbers such as "319027"; use search_products to find them.`
		);
	}

	// ------------------------------------------------------------------------
	// Output shapes
	// ------------------------------------------------------------------------

	private productUrl(id: string) {
		return `${this.siteUrl.replace(/\/+$/, '')}/tuotteet/${id}/`;
	}

	private sale(item: PriceListItem) {
		return getSaleInfo({
			price: item[AllColumns.Price],
			normalPrice: item[AllColumns.NormalPrice],
			campaignStart: item[AllColumns.CampaignStart],
			campaignEnd: item[AllColumns.CampaignEnd]
		});
	}

	summary(item: PriceListItem) {
		const id = String(item[AllColumns.Number]);
		return {
			id,
			name: String(item[AllColumns.Name]),
			manufacturer: text(item[AllColumns.Manufacturer]),
			category: text(item[AllColumns.Type]),
			subcategory: text(item[AllColumns.SubType]),
			country: text(item[AllColumns.Country]),
			bottle_size_l: num(item[AllColumns.BottleSize]),
			price_eur: num(item[AllColumns.Price]),
			price_per_liter_eur: num(item[AllColumns.PricePerLiter]),
			alcohol_percentage: num(item[AllColumns.AlcoholPercentage]),
			alcohol_grams_per_euro: num(item[AllColumns.AlcoholGramsPerEuro]),
			euro_per_liter_alcohol: num(item[AllColumns.EuroPerLiterAlcohol]) || null,
			sale_discount_percent: this.sale(item)?.discountPercent ?? null,
			removed_from_selection: Boolean(item[AllColumns.RemovedFromSelection]),
			url: this.productUrl(id)
		};
	}

	metrics(item: PriceListItem) {
		return {
			alcohol_grams: num(item[AllColumns.AlcoholGrams]),
			alcohol_grams_per_euro: num(item[AllColumns.AlcoholGramsPerEuro]),
			euro_per_liter_alcohol: num(item[AllColumns.EuroPerLiterAlcohol]) || null,
			standard_drinks: num(item[AllColumns.Servings]),
			estimated_promille: num(item[AllColumns.EstimatedPromille]),
			promille_per_euro: num(item[AllColumns.PromillePerEuro])
		};
	}

	private history(item: PriceListItem): PriceHistoryEntry[] {
		const history = item[AllColumns.History];
		if (!Array.isArray(history)) return [];
		return history
			.filter(
				(entry): entry is PriceHistoryEntry =>
					!!entry &&
					typeof entry.date === 'string' &&
					typeof entry.price === 'number' &&
					Number.isFinite(entry.price)
			)
			.toSorted((a, b) => a.date.localeCompare(b.date));
	}

	private historySummary(item: PriceListItem) {
		const history = this.history(item);
		if (history.length === 0) return null;
		const first = history[0]!;
		const lowest = history.reduce((min, entry) => (entry.price < min.price ? entry : min));
		const highest = history.reduce((max, entry) => (entry.price > max.price ? entry : max));
		const current = num(item[AllColumns.Price]) ?? history.at(-1)!.price;
		return {
			tracked_since: first.date,
			recorded_prices: history.length,
			first_price_eur: first.price,
			lowest: { price_eur: lowest.price, date: lowest.date },
			highest: { price_eur: highest.price, date: highest.date },
			last_change_date: history.at(-1)!.date,
			change_since_first_eur: round(current - first.price),
			change_since_first_percent:
				first.price > 0 ? round((current / first.price - 1) * 100, 1) : null
		};
	}

	private storesFor(item: PriceListItem): AvailabilityStore[] {
		const ids = this.availability.product[String(item[AllColumns.Number])] ?? [];
		return ids
			.map((id) => this.availability.stores[id])
			.filter((store): store is AvailabilityStore => Boolean(store));
	}

	// ------------------------------------------------------------------------
	// Tools
	// ------------------------------------------------------------------------

	getProduct(input: string) {
		const item = this.requireProduct(input);
		const id = String(item[AllColumns.Number]);
		const sale = this.sale(item);
		return {
			product: {
				...this.summary(item),
				region: text(item[AllColumns.Region]),
				style: text(item[AllColumns.BeerType]),
				// Kaljakori parses numeric-looking strings, so a vintage arrives as a number.
				vintage:
					typeof item[AllColumns.Vintage] === 'number'
						? String(item[AllColumns.Vintage])
						: text(item[AllColumns.Vintage]),
				special_group: text(item[AllColumns.SpecialGroup]),
				selection: text(item[AllColumns.Availability]),
				packaging: text(item[AllColumns.PackagingType]),
				closure: text(item[AllColumns.SealingType]),
				label_info: text(item[AllColumns.LabelInfo]),
				ean: text(item[AllColumns.EAN]),
				is_new: normalize(String(item[AllColumns.New] ?? '')) === 'uutuus',
				taste_descriptors: list(item[AllColumns.Description]),
				grapes: list(item[AllColumns.GrapeVarieties]),
				notes: list(item[AllColumns.Note]),
				sugar_g_per_l: num(item[AllColumns.Sugar]),
				acids_g_per_l: num(item[AllColumns.Acidity]),
				energy_kcal_per_100ml: num(item[AllColumns.Energy]),
				original_gravity_plato: measurement(item[AllColumns.OriginalGravity]),
				color_ebc: measurement(item[AllColumns.ColorEBC]),
				bitterness_ebu: measurement(item[AllColumns.BitternessEBU]),
				sale: sale
					? {
							sale_price_eur: sale.salePrice,
							normal_price_eur: sale.normalPrice,
							discount_percent: sale.discountPercent,
							campaign_start: sale.campaignStart ?? null,
							campaign_end: sale.campaignEnd ?? null
						}
					: null,
				metrics: this.metrics(item),
				price_history_summary: this.historySummary(item),
				store_count: this.storesFor(item).length,
				alko_url: `https://www.alko.fi/tuotteet/${id}`,
				image_url: generateImageUrl(id)
			},
			metrics_note: METRICS_NOTE,
			dataset: this.status
		};
	}

	search(params: SearchParams) {
		const filters: Record<string, unknown> = {};
		const applied: Record<string, unknown> = {};

		const categorical: [FilterField, string[] | undefined][] = [
			['category', params.category],
			['subcategory', params.subcategory],
			['style', params.style],
			['country', params.country],
			['region', params.region],
			['manufacturer', params.manufacturer],
			['packaging', params.packaging],
			['selection', params.selection],
			['grape', params.grapes],
			['taste_descriptor', params.taste_descriptors]
		];
		for (const [field, values] of categorical) {
			if (!values?.length || field === 'store') continue;
			const resolved = this.resolveValues(field, values, params.include_removed);
			filters[FILTER_FIELDS[field]] = new Set(resolved);
			applied[field] = resolved;
		}
		if (params.store?.length) {
			const stores = this.resolveStores(params.store);
			filters[AllColumns.StoreAvailability] = new Set(stores.map((store) => store.name));
			applied.store = stores.map((store) => store.name);
		}

		const ranges: [ColumnNames, string, number | undefined, number | undefined][] = [
			[AllColumns.Price, 'price_eur', params.min_price, params.max_price],
			[
				AllColumns.AlcoholPercentage,
				'alcohol_percentage',
				params.min_alcohol_percentage,
				params.max_alcohol_percentage
			],
			[AllColumns.BottleSize, 'bottle_size_l', params.min_bottle_size_l, params.max_bottle_size_l],
			[AllColumns.Sugar, 'sugar_g_per_l', undefined, params.max_sugar_g_per_l]
		];
		for (const [column, name, min, max] of ranges) {
			if (min === undefined && max === undefined) continue;
			if (min !== undefined && max !== undefined && min > max) {
				throw new ToolInputError(`min ${name} (${min}) is greater than max ${name} (${max}).`);
			}
			filters[column] = [min ?? -Infinity, max ?? Infinity];
			applied[name] = { min: min ?? null, max: max ?? null };
		}

		const query = params.query?.trim() ?? '';
		let results = this.kaljakori
			.fuzzySearchAndFilter(query, filters)
			.filter((item) => params.include_removed || !item[AllColumns.RemovedFromSelection]);
		if (params.on_sale !== undefined) {
			results = results.filter((item) => Boolean(this.sale(item)) === params.on_sale);
			applied.on_sale = params.on_sale;
		}

		const sortBy: SortKey = params.sort_by ?? (query ? 'relevance' : 'alcohol_grams_per_euro');
		results = this.sort(results, sortBy, query, params.sort_order);

		const limit = Math.min(Math.max(params.limit ?? SEARCH_LIMIT_DEFAULT, 1), SEARCH_LIMIT_MAX);
		const offset = Math.max(params.offset ?? 0, 0);
		const page = results.slice(offset, offset + limit);

		return {
			total_matches: results.length,
			offset,
			returned: page.length,
			has_more: offset + page.length < results.length,
			sort_by: sortBy,
			applied_filters: {
				...(query ? { query } : {}),
				...applied,
				include_removed: Boolean(params.include_removed)
			} as Record<string, unknown>,
			products: page.map((item) => this.summary(item)),
			...(results.length === 0
				? {
						hint: 'No products matched. Loosen or remove filters, check spelling, or use list_filter_values to see valid filter values.'
					}
				: {}),
			dataset: this.status
		};
	}

	private sort(items: PriceListItem[], sortBy: SortKey, query: string, order?: 'asc' | 'desc') {
		const spec = SORT_KEYS[sortBy];
		if (!spec) {
			// Relevance: exact name, then prefix, then substring, then fuzzy matches.
			const q = normalize(query);
			const rank = (item: PriceListItem) => {
				const name = normalize(String(item[AllColumns.Name]));
				if (!q) return 0;
				if (name === q) return 0;
				if (name.startsWith(q)) return 1;
				if (name.includes(q)) return 2;
				return 3;
			};
			return items
				.map((item) => ({ item, rank: rank(item), length: String(item[AllColumns.Name]).length }))
				.sort((a, b) => a.rank - b.rank || a.length - b.length)
				.map(({ item }) => item);
		}

		const ascending = order ? order === 'asc' : spec.ascending;
		const direction = ascending ? 1 : -1;
		if (spec.column === AllColumns.Name) {
			return items.toSorted(
				(a, b) => direction * String(a[spec.column]).localeCompare(String(b[spec.column]), 'fi')
			);
		}
		// Missing values (and 0 €/L alcohol for alcohol-free products) always sort last.
		const value = (item: PriceListItem) => {
			const v = num(item[spec.column]);
			if (v === null) return null;
			if (spec.column === AllColumns.EuroPerLiterAlcohol && v <= 0) return null;
			return v;
		};
		return items.toSorted((a, b) => {
			const va = value(a);
			const vb = value(b);
			if (va === null && vb === null) return 0;
			if (va === null) return 1;
			if (vb === null) return -1;
			return direction * (va - vb);
		});
	}

	compare(inputs: string[]) {
		const found: PriceListItem[] = [];
		const notFound: string[] = [];
		for (const input of inputs) {
			const item = this.findProduct(input);
			if (!item) notFound.push(input);
			else if (!found.includes(item)) found.push(item);
		}
		if (found.length === 0) {
			throw new ToolInputError(
				`None of the product IDs were found: ${notFound.join(', ')}. Use search_products to find product IDs.`
			);
		}

		const products = found.map((item) => ({
			...this.summary(item),
			standard_drinks: num(item[AllColumns.Servings]),
			alcohol_grams: num(item[AllColumns.AlcoholGrams])
		}));

		const best = (
			pick: (p: (typeof products)[number]) => number | null,
			highest: boolean
		): { id: string; name: string; value: number } | null => {
			let winner: { id: string; name: string; value: number } | null = null;
			for (const product of products) {
				const value = pick(product);
				if (value === null || value <= 0) continue;
				if (!winner || (highest ? value > winner.value : value < winner.value)) {
					winner = { id: product.id, name: product.name, value };
				}
			}
			return winner;
		};

		return {
			products,
			best: {
				lowest_price: best((p) => p.price_eur, false),
				lowest_price_per_liter: best((p) => p.price_per_liter_eur, false),
				most_alcohol_per_euro: best((p) => p.alcohol_grams_per_euro, true),
				lowest_price_per_liter_of_alcohol: best((p) => p.euro_per_liter_alcohol, false),
				highest_alcohol_percentage: best((p) => p.alcohol_percentage, true)
			},
			not_found: notFound,
			metrics_note: METRICS_NOTE,
			dataset: this.status
		};
	}

	priceHistory(input: string, limit?: number) {
		const item = this.requireProduct(input);
		const history = this.history(item);
		const shown = limit ? history.slice(-limit) : history;
		return {
			product: this.summary(item),
			current_price_eur: num(item[AllColumns.Price]),
			summary: this.historySummary(item),
			history: shown.map((entry) => ({
				date: entry.date,
				price_eur: entry.price,
				normal_price_eur: entry.normalPrice ?? null,
				campaign_start: entry.campaignStart ?? null,
				campaign_end: entry.campaignEnd ?? null
			})),
			history_truncated: shown.length < history.length,
			note:
				'A history entry is recorded when Alkometriikka first saw the product and whenever its price changed ' +
				'afterwards, so each entry is the price in effect from that date until the next entry. Entries with a ' +
				'normal_price_eur were recorded during a sales campaign. History only covers the period Alkometriikka ' +
				'has tracked the product.',
			dataset: this.status
		};
	}

	storeAvailability(input: string, options: { city?: string; store?: string; limit: number }) {
		const item = this.requireProduct(input);
		const hasAvailability = Object.keys(this.availability.stores).length > 0;
		const all = this.storesFor(item).toSorted((a, b) => a.name.localeCompare(b.name, 'fi'));

		let matching = all;
		if (options.city) {
			const city = normalize(options.city);
			matching = matching.filter(
				(store) =>
					normalize(getStoreCity(store)) === city ||
					normalize(String((store as { city?: unknown }).city ?? '')) === city
			);
		}
		if (options.store) {
			const query = normalize(options.store);
			matching = matching.filter(
				(store) => store.id === options.store!.trim() || normalize(store.name).includes(query)
			);
		}

		const now = new Date();
		const selection = text(item[AllColumns.Availability]);
		return {
			product: this.summary(item),
			selection,
			availability_data_loaded: hasAvailability,
			available_store_count: all.length,
			matching_store_count: matching.length,
			stores: matching.slice(0, options.limit).map((store) => ({
				store_id: store.id,
				name: store.name,
				city: getStoreCity(store) || null,
				address: store.address ?? null,
				postal_code: store.postalCode ?? null,
				opening_hours_today: getTodaysOpeningHours(store, now),
				open_now: isStoreOpen(store, now)
			})),
			stores_truncated: matching.length > options.limit,
			limitations: hasAvailability
				? AVAILABILITY_LIMITATIONS
				: [
						'Store availability data could not be loaded, so availability is unknown (not zero).',
						...AVAILABILITY_LIMITATIONS
					],
			dataset: this.status
		};
	}

	statistics(category?: string) {
		let items = this.kaljakori.data;
		let scope = 'all products';
		if (category) {
			const resolved = this.resolveValues('category', [category]);
			const allowed = new Set(resolved);
			items = items.filter((item) => allowed.has(String(item[AllColumns.Type])));
			scope = `category: ${resolved.join(', ')}`;
		}
		const active = activeProducts(items);
		const summary = computeSummary(items);
		const prices = active
			.map((item) => num(item[AllColumns.Price]))
			.filter((price): price is number => price !== null && price > 0);
		const breakdownColumn = category ? AllColumns.SubType : AllColumns.Type;

		return {
			scope,
			product_count: items.length,
			active_product_count: active.length,
			removed_product_count: items.length - active.length,
			on_sale_count: active.filter((item) => this.sale(item)).length,
			new_product_count: active.filter(
				(item) => normalize(String(item[AllColumns.New] ?? '')) === 'uutuus'
			).length,
			average_price_eur: summary.avgPrice === null ? null : round(summary.avgPrice),
			average_price_per_liter_eur:
				summary.avgPricePerLiter === null ? null : round(summary.avgPricePerLiter),
			average_alcohol_percentage:
				summary.avgAlcoholPercentage === null ? null : round(summary.avgAlcoholPercentage, 1),
			price_range_eur: prices.length
				? { min: Math.min(...prices), max: Math.max(...prices) }
				: null,
			[category ? 'subcategories' : 'categories']: categoryDistribution(items, breakdownColumn).map(
				({ key, count }) => ({ name: key, count })
			),
			top_countries: categoryDistribution(items, AllColumns.Country)
				.slice(0, 10)
				.map(({ key, count }) => ({ name: key, count })),
			best_alcohol_value: bestValueRanks(active, 5).map((rank) => ({
				id: rank.number,
				name: rank.name,
				price_eur: rank.price,
				alcohol_grams_per_euro: rank.gramsPerEuro
			})),
			store_count: Object.keys(this.availability.stores).length,
			note: 'Counts and averages cover products currently in Alko’s selection (removed products are excluded) unless stated otherwise; product_count includes removed products.',
			dataset: this.status
		};
	}

	filterValues(field: FilterField, contains?: string, limit = 100) {
		const query = contains ? normalize(contains) : '';
		let values: { value: string; count: number; store_id?: string; city?: string | null }[];

		if (field === 'store') {
			const counts = new Map<string, number>();
			for (const item of activeProducts(this.kaljakori.data)) {
				for (const name of list(item[AllColumns.StoreAvailability])) {
					counts.set(name, (counts.get(name) ?? 0) + 1);
				}
			}
			values = Object.values(this.availability.stores)
				.map((store) => ({
					value: store.name,
					count: counts.get(store.name) ?? 0,
					store_id: store.id,
					city: getStoreCity(store) || null
				}))
				.sort((a, b) => a.value.localeCompare(b.value, 'fi'));
		} else if (SET_FIELDS.has(field)) {
			const counts = new Map<string, number>();
			for (const item of activeProducts(this.kaljakori.data)) {
				for (const value of list(item[FILTER_FIELDS[field as keyof typeof FILTER_FIELDS]])) {
					counts.set(value, (counts.get(value) ?? 0) + 1);
				}
			}
			values = [...counts.entries()]
				.map(([value, count]) => ({ value, count }))
				.sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, 'fi'));
		} else {
			values = categoryDistribution(
				this.kaljakori.data,
				FILTER_FIELDS[field as keyof typeof FILTER_FIELDS]
			).map(({ key, count }) => ({ value: key, count }));
			values = mergeSpellingVariants(values);
		}

		const matching = query
			? values.filter(
					(entry) =>
						normalize(entry.value).includes(query) ||
						(entry.city ? normalize(entry.city).includes(query) : false)
				)
			: values;
		return {
			field,
			total_values: matching.length,
			values: matching.slice(0, limit),
			truncated: matching.length > limit,
			note: 'count is the number of products currently in Alko’s selection with that value.',
			dataset: this.status
		};
	}

	// ------------------------------------------------------------------------
	// Filter value resolution
	// ------------------------------------------------------------------------

	/**
	 * Maps user-supplied values to the exact dataset values `Kaljakori` filters on.
	 * Matching is case-insensitive; a value with no exact match matches every
	 * dataset value containing it (e.g. "viski" → "Viskit"), and failing that the
	 * single closest value if it is very similar (e.g. "olut" → "Oluet"). Set-valued
	 * fields use AND semantics, so an ambiguous partial match there is rejected instead.
	 */
	private resolveValues(
		field: Exclude<FilterField, 'store'>,
		inputs: string[],
		includeRemoved = false
	): string[] {
		// Removed products carry legacy values (e.g. old category names) that would
		// otherwise match but return nothing, so only offer values of active products.
		const candidates = this.kaljakori
			.getFilterValues(FILTER_FIELDS[field], includeRemoved)
			.filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
		const resolved = new Set<string>();

		for (const input of inputs) {
			const q = normalize(input);
			if (!q) continue;
			const exact = candidates.filter((candidate) => normalize(candidate) === q);
			if (exact.length) {
				exact.forEach((value) => resolved.add(value));
				continue;
			}
			let partial = candidates.filter((candidate) => normalize(candidate).includes(q));
			// Regions are "Area - appellation"; prefer the area so "Champagne" does not also
			// match "Cognac - AC Cognac Grande Champagne".
			if (field === 'region') {
				const byArea = partial.filter((candidate) => regionArea(candidate).includes(q));
				if (byArea.length) partial = byArea;
			}
			if (partial.length === 0) {
				const scored = candidates
					.map((candidate) => ({ candidate, score: similarity(normalize(candidate), q) }))
					.sort((a, b) => b.score - a.score);
				// Tolerate inflection and typos ("olut" → "Oluet") when one value is clearly closest.
				const [closest, runnerUp] = scored;
				if (closest && closest.score >= 0.8 && (!runnerUp || runnerUp.score < closest.score)) {
					resolved.add(closest.candidate);
					continue;
				}
				const suggestions = scored.slice(0, 5).map(({ candidate }) => `"${candidate}"`);
				// A common mistake is using the wrong level, e.g. category "Oluet" (a subcategory).
				const otherField = (Object.keys(FILTER_FIELDS) as (keyof typeof FILTER_FIELDS)[]).find(
					(other) =>
						other !== field &&
						this.kaljakori
							.getFilterValues(FILTER_FIELDS[other], includeRemoved)
							.some((value) => typeof value === 'string' && normalize(value) === q)
				);
				throw new ToolInputError(
					(otherField
						? `"${input}" is not a ${field} but a ${otherField}; use the ${otherField} filter instead. `
						: `No ${field} matches "${input}". Closest values: ${suggestions.join(', ')}. `) +
						`Call list_filter_values with field "${field}" to see all valid values.`
				);
			}
			if (SET_FIELDS.has(field) && partial.length > 1) {
				throw new ToolInputError(
					`"${input}" matches several ${field} values (${partial
						.slice(0, 10)
						.map((value) => `"${value}"`)
						.join(', ')}${partial.length > 10 ? ', …' : ''}). Use one exact value.`
				);
			}
			partial.forEach((value) => resolved.add(value));
		}
		return [...resolved];
	}

	/** Resolves store IDs, store names or city names to stores. */
	private resolveStores(inputs: string[]): AvailabilityStore[] {
		const stores = Object.values(this.availability.stores);
		if (stores.length === 0) {
			throw new ToolInputError(
				'Store availability data is not available right now, so the store filter cannot be used.'
			);
		}
		const resolved = new Map<string, AvailabilityStore>();
		for (const input of inputs) {
			const q = normalize(input);
			if (!q) continue;
			const byId = this.availability.stores[input.trim()];
			const exact = byId ? [byId] : stores.filter((store) => normalize(store.name) === q);
			const byCity = stores.filter((store) => normalize(getStoreCity(store)) === q);
			const partial = stores.filter((store) => normalize(store.name).includes(q));
			const matches = exact.length ? exact : byCity.length ? byCity : partial;
			if (matches.length === 0) {
				throw new ToolInputError(
					`No store matches "${input}". Use a store ID, a store name or a city; ` +
						'call list_filter_values with field "store" to see all stores.'
				);
			}
			matches.forEach((store) => resolved.set(store.id, store));
		}
		return [...resolved.values()];
	}
}

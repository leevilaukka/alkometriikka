/**
 * 1. Hae edellinen versio datasta (data.json)
 * 2. Hae uusi data Alkon API:sta
 * 3. Vertaa vanhaa ja uutta dataa, ja päivitä data.json -tiedostoon
 *
 * Jos tuotetiedot ovat muuttuneet, päivitetään data.json -tiedostoon. Jos tuotteet on lisätty tai poistettu, päivitetään data.json -tiedostoon.
 *
 * Tiedoston päivittämisen jälkeen, data.json -tiedosto voidaan käyttää sovelluksessa.
 *
 * URLt:
 * - Hakuapi: POST https://www.alko.fi/api/search/product (body: { top: 1000, skip: 0 }) TS interface SearchApiResponse
 * - Tuotetiedot: GET https://www.alko.fi/api/product-api/products/{productId} TS interface ProductDetailsApiResponse
 *
 * Headerit:
 * - User-Agent: Mozilla/5.0 (X11; Linux x86_64; rv:147.0) Gecko/20100101 Firefox/147.0 (tai vastaava)
 *
 * Muistiinpanot -> notes/notes.md
 */

import {
	DEV,
	LEGACY_HEADERS,
	REQUEST_HEADERS,
	SEARCH_URL,
	STORES_URL,
	buildLegacyValues,
	getHash,
	getHashValues,
	isIrrelevantMainGroup,
	isIrrelevantStoredValues,
	productDetailsUrl
} from './constants.ts';
import type {
	AvailabilityData,
	DetailedProductData,
	MigratedData,
	MigratedProduct,
	PricePoint,
	ProductDetailsApiResponse,
	ProductMeta,
	SearchApiResponse,
	SearchProductData,
	StoreData,
	StoresApiResponse
} from './types.ts';

// ============================================================================
// CONFIG & CONSTANTS
// ============================================================================

/** Where the dataset is read from and written to. Mirrors the legacy setup.ts convention. */
const DATA_PATH = DEV ? './static/data.json' : './data.json';
/** Store and per-product availability generated from the same complete search sweep. */
const AVAILABILITY_PATH = DEV ? './static/availability.json' : './availability.json';
/** Fallback base dataset used when no synced `data.json` exists yet (produced by migrate.ts). */
const MIGRATED_DATA_PATH = './data-migrated.json';

/** How many products the search API returns per page. */
const PAGE_SIZE = 1000;
/** Delay (ms) between consecutive search page requests to avoid rate limiting. */
const SEARCH_PAGE_DELAY_MS = 300;
/**
 * A fixed scoring `seed` sent with every search request. Without it the API
 * returns a non-deterministic subset of the catalogue (~7000-7700 distinct
 * products) and pads the remaining rows with duplicates, even though
 * `@odata.count` advertises the full ~11000+ total — which caused thousands of
 * live products to be missing from each sweep and falsely flagged as removed.
 * Pinning a seed makes paging deterministic so every distinct product is
 * returned exactly once.
 */
const SEARCH_SEED = 1337;
/** How many detail requests to run in parallel. */
const DEFAULT_DETAIL_CONCURRENCY = 4;
/** How many times to retry a failed/ratelimited request before giving up. */
const DEFAULT_MAX_RETRIES = 5;
/** Base delay (ms) used for exponential backoff on retries. */
const RETRY_BASE_DELAY_MS = 1000;
/** Upper bound (ms) for a single backoff wait. */
const RETRY_MAX_DELAY_MS = 60_000;
/** How often (in products) to log detail-fetch progress. */
const PROGRESS_LOG_INTERVAL = 25;

const VERBOSE = truthyEnvVar('VERBOSE');

/** Column indices we read back out of a stored `values` array. */
const NUMERO_INDEX = LEGACY_HEADERS.indexOf('Numero');
const NIMI_INDEX = LEGACY_HEADERS.indexOf('Nimi');
const HINTA_INDEX = LEGACY_HEADERS.indexOf('Hinta');

interface Config {
	detailConcurrency: number;
	maxRetries: number;
	maxPages: number;
}

function truthyEnvVar(name: string): boolean {
	const value = process.env[name];
	return value === 'true' || value === '1';
}

function loadConfig(): Config {
	const detailConcurrency = Math.max(
		1,
		Number(process.env.ALKO_DETAIL_CONCURRENCY) || DEFAULT_DETAIL_CONCURRENCY
	);
	const maxRetries = Math.max(0, Number(process.env.ALKO_MAX_RETRIES) || DEFAULT_MAX_RETRIES);
	const maxPages = Number(process.env.ALKO_MAX_PAGES) || Infinity;
	return { detailConcurrency, maxRetries, maxPages };
}

interface SyncStats {
	unchanged: number;
	updated: number;
	added: number;
	removed: number;
	failed: number;
	filtered: number;
	filteredRemoved: number;
}

/** Returns a copy of `meta` without the `removedFromSelection` flag, or `undefined` if nothing remains. */
function withoutRemovedFlag(meta: ProductMeta | undefined): ProductMeta | undefined {
	if (!meta) return undefined;
	const { removedFromSelection, ...rest } = meta;
	return Object.keys(rest).length > 0 ? rest : undefined;
}

/** Clears the `removedFromSelection` flag on a product that is back in the selection. */
function clearRemovedFlag(product: MigratedProduct): MigratedProduct {
	if (!product.meta?.removedFromSelection) return product;
	const meta = withoutRemovedFlag(product.meta);
	const { meta: _omit, ...rest } = product;
	return meta ? { ...rest, meta } : rest;
}

// ============================================================================
// HELPERS
// ============================================================================

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function toNumber(value: unknown): number | null {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string') {
		const normalized = Number(value.replace(',', '.').trim());
		if (Number.isFinite(normalized)) return normalized;
	}
	return null;
}

function isMigratedProduct(entry: unknown): entry is MigratedProduct {
	return (
		!!entry &&
		typeof entry === 'object' &&
		typeof (entry as MigratedProduct).hash === 'string' &&
		Array.isArray((entry as MigratedProduct).values)
	);
}

/**
 * Appends today's price to the product's history when it differs from the most
 * recent recorded price. Existing history is preserved untouched otherwise.
 */
function updatePriceHistory(
	previous: PricePoint[] | undefined,
	price: number | null
): PricePoint[] {
	const history = Array.isArray(previous) ? [...previous] : [];
	if (price === null) return history;

	const last = history[history.length - 1];
	if (!last || last.price !== price) {
		history.push({ date: new Date().toISOString().slice(0, 10), price });
	}
	return history;
}

/**
 * Runs `worker` over `items` with at most `limit` promises in flight at once.
 */
async function mapWithConcurrency<T>(
	items: T[],
	limit: number,
	worker: (item: T, index: number) => Promise<void>
): Promise<void> {
	let cursor = 0;
	const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
		while (true) {
			const index = cursor++;
			if (index >= items.length) return;
			await worker(items[index]!, index);
		}
	});
	await Promise.all(runners);
}

// ============================================================================
// HTTP
// ============================================================================

async function fetchJson<T>(url: string, init: RequestInit, maxRetries: number): Promise<T | null> {
	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		try {
			const response = await fetch(url, {
				...init,
				headers: { ...REQUEST_HEADERS, ...init.headers }
			});

			if (response.status === 403 || response.status === 429) {
				const backoff =
					Math.min(RETRY_BASE_DELAY_MS * 2 ** attempt, RETRY_MAX_DELAY_MS) + Math.random() * 500;
				console.log(
					`  ⏳ Rate limited (${response.status}), retry ${attempt + 1}/${maxRetries} in ${Math.round(backoff)}ms`
				);
				if (VERBOSE) {
					console.log(`  ❗ Response headers:`, Object.fromEntries(response.headers.entries()));
				}
				await sleep(backoff);
				continue;
			}

			if (!response.ok) {
				throw new Error(`HTTP ${response.status} ${response.statusText}`);
			}

			return (await response.json()) as T;
		} catch (error) {
			if (attempt >= maxRetries) {
				console.error(`  ❌ Request failed after ${maxRetries} retries: ${url}`, error);
				return null;
			}
			await sleep(RETRY_BASE_DELAY_MS);
		}
	}
	return null;
}

/** Result of a paginated search fetch, including whether it completed fully. */
interface SearchFetchResult {
	products: SearchProductData[];
	/** True only when every page was fetched successfully (see `@odata.count`). */
	complete: boolean;
	/** Total product count the API reported via `@odata.count`, if available. */
	expectedTotal: number | null;
}

/**
 * Fetches every product from the paginated search API.
 *
 * The API is doubly awkward here:
 *
 * 1. A failed page request returns `null` from `fetchJson`, which is
 *    indistinguishable from a genuine end-of-list empty page if we only look at
 *    the array length. Treating a failed page as "the end" is what caused
 *    thousands of live products to be missing from the API id set and therefore
 *    falsely flagged as removed from the selection.
 * 2. Without a fixed scoring `seed` the results are non-deterministic: a full
 *    paginated pass returns only ~7000-7700 *distinct* products and pads the
 *    remaining rows with duplicates, even though `@odata.count` advertises the
 *    full ~11000+ total. Sending `SEARCH_SEED` pins the ordering so every
 *    distinct product is returned exactly once across the pages.
 *
 * We still dedupe by id defensively and only report `complete` when we collected
 * the full advertised count without a page failing, so the caller can refuse to
 * run the removal pass on a partial dataset.
 */
async function loadSearchProducts(config: Config): Promise<SearchFetchResult> {
	const byId = new Map<string, SearchProductData>();
	let expectedTotal: number | null = null;
	let complete = true;

	for (let page = 0; page < config.maxPages; page++) {
		const skip = page * PAGE_SIZE;
		const response = await fetchJson<SearchApiResponse>(
			SEARCH_URL,
			// A fixed `seed` makes paging deterministic and duplicate-free (see above).
			{ method: 'POST', body: JSON.stringify({ top: PAGE_SIZE, skip, seed: SEARCH_SEED }) },
			config.maxRetries
		);

		// A null response means the request failed after all retries. We cannot tell
		// this apart from a legitimately empty page by array length alone, so we
		// must treat the whole fetch as incomplete rather than assume end-of-list.
		if (response === null) {
			console.error(
				`  ❌ Search page ${page + 1} (skip ${skip}) failed after retries — marking fetch as incomplete.`
			);
			complete = false;
			break;
		}

		if (expectedTotal === null && typeof response['@odata.count'] === 'number') {
			expectedTotal = response['@odata.count'];
			console.log(`  🔢 API reports ${expectedTotal} total products`);
		}

		const batch = response.value ?? [];
		if (batch.length === 0) break;

		for (const product of batch) byId.set(product.id, product);

		console.log(`  📦 Fetched ${byId.size} unique products (page ${page + 1})`);

		if (batch.length < PAGE_SIZE) break;
		if (expectedTotal !== null && byId.size >= expectedTotal) break;

		// Space out page requests slightly to avoid tripping the API's rate limiter.
		await sleep(SEARCH_PAGE_DELAY_MS);
	}

	const products = [...byId.values()];
	// If the API told us how many products exist, require that we actually
	// collected them all before the set can be trusted for removal detection.
	if (expectedTotal !== null && products.length < expectedTotal) {
		complete = false;
	}

	return { products, complete, expectedTotal };
}

/** Fetches the full detail payload for a single product. */
async function fetchProductDetails(
	id: string,
	config: Config
): Promise<DetailedProductData | null> {
	const response = await fetchJson<ProductDetailsApiResponse>(
		productDetailsUrl(id),
		{ method: 'GET' },
		config.maxRetries
	);
	return response?.data ?? null;
}

/** Fetches all stores and indexes the unmodified API objects by store id. */
async function loadStores(config: Config): Promise<Record<string, StoreData> | null> {
	const response = await fetchJson<StoresApiResponse>(
		STORES_URL,
		{ method: 'GET' },
		config.maxRetries
	);
	const storeList = response?.data;
	const totalAmount = response?.totalAmount;

	if (!Array.isArray(storeList) || storeList.length === 0) {
		console.error('  ❌ Store API returned no stores.');
		return null;
	}
	if (typeof totalAmount === 'number' && storeList.length !== totalAmount) {
		console.error(`  ❌ Store API returned ${storeList.length}/${totalAmount} stores.`);
		return null;
	}

	const stores: Record<string, StoreData> = {};
	for (const store of storeList) {
		if (!store || typeof store !== 'object' || typeof store.id !== 'string' || !store.id) {
			console.error('  ❌ Store API returned a store without a valid id.');
			return null;
		}
		if (store.outletType === '2') continue;
		if (store.id in stores) {
			console.error(`  ❌ Store API returned duplicate id ${store.id}.`);
			return null;
		}
		stores[store.id] = store;
	}

	console.log(
		`  🏪 Fetched ${storeList.length} outlets, kept ${Object.keys(stores).length} stores`
	);
	return stores;
}

// ============================================================================
// DATA
// ============================================================================

async function loadExistingData(): Promise<MigratedData> {
	let file = Bun.file(DATA_PATH);
	let sourcePath = DATA_PATH;

	// Fall back to the migration output when no synced dataset exists yet.
	if (!(await file.exists())) {
		const migrated = Bun.file(MIGRATED_DATA_PATH);
		if (await migrated.exists()) {
			file = migrated;
			sourcePath = MIGRATED_DATA_PATH;
		}
	}

	if (VERBOSE) {
		console.log(`  📂 Loading existing dataset from ${sourcePath}...`);
	}

	try {
		const parsed = (await file.json()) as MigratedData;
		if (!parsed || !Array.isArray(parsed.schema)) {
			console.warn('⚠️  Existing dataset has no schema, starting fresh');
			const now = new Date().toISOString();
			return {
				schema: LEGACY_HEADERS,
				metadata: { LastUpdated: now, LastSynced: now },
				products: {}
			};
		}
		if (VERBOSE) {
			console.log(
				`  ✅ Loaded file: ${sourcePath} with ${Object.keys(parsed.products ?? {}).length} products - File size: ${file.size} bytes`
			);
		}
		return parsed;
	} catch (error) {
		console.warn(`⚠️  Failed to read ${sourcePath}, starting fresh:`, error);
		const now = new Date().toISOString();
		return {
			schema: LEGACY_HEADERS,
			metadata: { LastUpdated: now, LastSynced: now },
			products: {}
		};
	}
}

/**
 * Merges the search and detail payloads into a single object the schema can
 * read from. Detail-API keys win over search-API keys (see notes), while
 * price/abv/volume remain search-only fields and are preserved.
 */
function mergeProduct(
	search: SearchProductData,
	details: DetailedProductData
): Record<string, unknown> {
	return { ...search, ...details };
}

// ============================================================================
// CACHE
// ============================================================================

/**
 * Purges the deployed data.json from Cloudflare's cache so visitors receive the
 * freshly published dataset. Skipped in dev and when no purge key is configured.
 */
async function purgeCache(): Promise<void> {
	if (DEV) return;

	const purgeKey = process.env.CLOUDFLARE_PURGE_KEY;
	if (!purgeKey) {
		console.warn('⚠️  CLOUDFLARE_PURGE_KEY is not set. Skipping cache purge.');
		return;
	}

	console.log('🧹 Purging Cloudflare cache...');
	try {
		const response = await fetch(
			`https://api.cloudflare.com/client/v4/zones/${process.env.CLOUDFLARE_ZONE}/purge_cache`,
			{
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${purgeKey}`
				},
				body: JSON.stringify({
					files: [
						'https://alkometriikka.fi/data.json',
						'https://alkometriikka.fi/availability.json'
					]
				})
			}
		);

		if (!response.ok) {
			throw new Error(`Cache purge failed: ${response.status} ${response.statusText}`);
		}
		if (VERBOSE) {
			console.log('  ✅ Cache purge successful.', await response.json());
		} else {
			console.log(
				'✅ Cache purge successful.',
				`Status: ${response.status} ${response.statusText}`
			);
		}
	} catch (error) {
		console.error('❌ Error during cache purge:', error);
	}
}

// ============================================================================
// SYNC
// ============================================================================

async function sync(): Promise<void> {
	console.log('🚀 Starting Alko sync...\n');
	const config = loadConfig();
	if (VERBOSE) {
		console.log(`  🔧 Config:`, config);
	}

	const [searchResult, existing, stores] = await Promise.all([
		loadSearchProducts(config),
		loadExistingData(),
		loadStores(config)
	]);

	const searchProducts = searchResult.products;
	const existingProducts = existing.products ?? {};

	// Bail out before touching the dataset if the search fetch was incomplete.
	// A partial fetch is missing live products, so proceeding would overwrite the
	// existing dataset with a corrupted view (and falsely flag live products as
	// removed). Exit with a warning and leave the existing data.json untouched.
	if (!searchResult.complete) {
		const totalLabel = searchResult.expectedTotal !== null ? `/${searchResult.expectedTotal}` : '';
		console.warn(
			`\n⚠️  Search fetch was INCOMPLETE (${searchProducts.length}${totalLabel} products). ` +
				`Aborting sync without writing the dataset to avoid overwriting existing data with a ` +
				`partial result. Re-run the sync once the API returns the full product list.`
		);
		process.exit(1);
	}

	// Bail out if the API returned no products at all. An empty response would
	// flag every existing product as removed and overwrite the dataset with an
	// empty view, so treat it the same as an incomplete fetch and leave the
	// existing data.json untouched.
	if (searchProducts.length === 0) {
		console.warn(
			`\n⚠️  Search fetch returned 0 products. Aborting sync without writing the dataset to ` +
				`avoid overwriting existing data with an empty result. Re-run the sync once the API ` +
				`returns the product list.`
		);
		process.exit(1);
	}

	if (!stores) {
		console.warn(
			'\n⚠️  Store fetch failed or returned no stores. Aborting sync without writing either dataset.'
		);
		process.exit(1);
	}

	console.log(
		`\n📦 ${searchProducts.length} products from API, ${Object.keys(existingProducts).length} in existing dataset\n`
	);

	const products: Record<string, MigratedProduct> = {};
	const stats: SyncStats = {
		unchanged: 0,
		updated: 0,
		added: 0,
		removed: 0,
		failed: 0,
		filtered: 0,
		filteredRemoved: 0
	};

	// Cheap first pass: hash the search-only fields and skip anything unchanged.
	const pending: Array<{ product: SearchProductData; hash: string; previous?: MigratedProduct }> =
		[];

	// Ids the API classifies as irrelevant (gifts & drinking accessories).
	const irrelevantIds = new Set<string>();

	for (const product of searchProducts) {
		// Drop gifts & drinking accessories entirely: they never enter the dataset.
		if (isIrrelevantMainGroup(product as unknown as Record<string, unknown>)) {
			irrelevantIds.add(product.id);
			stats.filtered++;
			continue;
		}

		const searchHash = getHash(
			getHashValues(buildLegacyValues(product as unknown as Record<string, unknown>))
		);
		const previous = existingProducts[product.id];

		if (isMigratedProduct(previous) && previous.hash === searchHash) {
			// Back in (or still in) the selection: keep it, but drop any stale removed flag.
			products[product.id] = clearRemovedFlag(previous);
			stats.unchanged++;
		} else {
			pending.push({
				product,
				hash: searchHash,
				previous: isMigratedProduct(previous) ? previous : undefined,
			});
		}
	}

	console.log(
		`🔄 ${stats.unchanged} unchanged, fetching details for ${pending.length} new/changed products...\n`
	);

	// Expensive second pass: fetch full details only for new/changed products.
	const totalPending = pending.length;
	let processed = 0;
	await mapWithConcurrency(
		pending,
		config.detailConcurrency,
		async ({ product, hash, previous }) => {
			const details = await fetchProductDetails(product.id, config);
			if (!details) {
				stats.failed++;
				// Keep the previous entry so a transient failure never drops a product.
				// It's still in the selection, so clear any stale removed flag.
				if (previous) products[product.id] = clearRemovedFlag(previous);
			} else {
				const values = buildLegacyValues(mergeProduct(product, details));
				const price = toNumber(values[HINTA_INDEX]);
				const priceHistory = updatePriceHistory(previous?.priceHistory, price);
				const meta = withoutRemovedFlag(previous?.meta);

				products[product.id] = { hash, values, priceHistory, ...(meta ? { meta } : {}) };
				if (previous) {
					stats.updated++;
					const name = String(values[NIMI_INDEX] ?? '').trim() || '(nimetön)';
					const previousPrice = toNumber(previous.values[HINTA_INDEX]);
					const priceChanged = previousPrice !== null && price !== null && previousPrice !== price;
					const priceInfo = priceChanged ? ` (${previousPrice} € → ${price} €)` : '';
					// Compare the previous and current values to see what changed.
					const changedFields = values.reduce<string[]>((acc, value, index) => {
						if (previous.values[index] !== value) {
							acc.push(LEGACY_HEADERS[index]);
						}
						return acc;
					}, []);
					if (changedFields.length > 0 && VERBOSE) {
						console.log(
							`  🔄 Updated ${product.id} — ${name}${priceInfo}.\n\tChanged fields: \n\t${changedFields.map((f) => `\t• ${f} ${previous.values[LEGACY_HEADERS.indexOf(f as (typeof LEGACY_HEADERS)[number])]} → ${values[LEGACY_HEADERS.indexOf(f as (typeof LEGACY_HEADERS)[number])]}`).join('\n')}`
						);
					} else {
						console.log(`  🔄 Updated ${product.id} — ${name}${priceInfo}`);
					}
				} else {
					stats.added++;
				}
			}

			processed++;
			if (processed === totalPending || processed % PROGRESS_LOG_INTERVAL === 0) {
				console.log(`  📥 ${processed}/${totalPending} details fetched`);
			}
		}
	);

	// Never delete products: carry over every product from the existing dataset
	// (data.json, or the migrated fallback) that the latest search response no
	// longer contains, and flag it as removed from the selection. The rule is
	// simple: a product counts as "removed from selection" purely by its absence
	// from the API's search response. Anything the API still returns is always
	// kept as an active product, and any stale removed flag is cleared.
	//
	// This is only reached when the search fetch was complete (we exit early
	// otherwise), so the API id set can be trusted for removal detection.
	const apiIds = new Set(searchProducts.map((product) => product.id));
	const today = new Date().toISOString().slice(0, 10);

	for (const [id, previous] of Object.entries(existingProducts)) {
		// Already rebuilt as an active product from the API response this run.
		if (id in products) continue;
		if (!isMigratedProduct(previous)) continue;

		// Drop any existing gifts & drinking accessories: matched by the API's
		// classification (by id) or, for items no longer in the API, by the stored
		// main-group name. These are excluded from the dataset, not "removed".
		if (irrelevantIds.has(id) || isIrrelevantStoredValues(previous.values)) {
			stats.filteredRemoved++;
			continue;
		}

		if (apiIds.has(id)) {
			// Still present in the API response: keep it active, clear any stale flag.
			products[id] = clearRemovedFlag(previous);
		} else if (previous.meta?.removedFromSelection) {
			// Missing from the API and already flagged in an earlier run: keep the
			// original removal date.
			products[id] = previous;
			products[id]['values'][LEGACY_HEADERS.indexOf('Uutuus')] = null; // Clear the "Uutuus" field for removed products
		} else {
			// Present in the existing dataset but absent from the API response: this
			// is a newly removed product, flag it with today's date.
			products[id] = {
				...previous,
				meta: { ...previous.meta, removedFromSelection: today }
			};
			products[id]['values'][LEGACY_HEADERS.indexOf('Uutuus')] = null; // Clear the "Uutuus" field for removed products
			stats.removed++;
		}
	}

	const now = new Date().toISOString();
	// `LastSynced` records every fetch; `LastUpdated` only moves when an actual
	// change to the data was detected this run.
	const hasChanges =
		stats.added > 0 || stats.updated > 0 || stats.removed > 0 || stats.filteredRemoved > 0;

	const workflowRunUrl =
		process.env.GITHUB_RUN_ID && process.env.GITHUB_REPOSITORY
			? `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
			: '';

	const currentCIRun = process.env.GITHUB_SHA
		? { commit: process.env.GITHUB_SHA, workflowRun: workflowRunUrl }
		: undefined;
	const previousCIRun = existing.metadata?.ci;
	const emptyCIRun = { commit: '', workflowRun: '' };

	const result: MigratedData = {
		schema: LEGACY_HEADERS,
		metadata: {
			LastUpdated: hasChanges ? now : (existing.metadata?.LastUpdated ?? now),
			LastSynced: now,
			ci: {
				sync: currentCIRun ?? previousCIRun?.sync ?? emptyCIRun,
				update: hasChanges
					? (currentCIRun ?? previousCIRun?.update ?? emptyCIRun)
					: (previousCIRun?.update ?? emptyCIRun)
			}
		},
		products
	};
	const availability: AvailabilityData = {
		lastUpdated: now,
		stores,
		product: Object.fromEntries(searchProducts.map((product) => [product.id, product.storeId]))
	};

	await Promise.all([
		Bun.write(DATA_PATH, JSON.stringify(result)),
		Bun.write(AVAILABILITY_PATH, JSON.stringify(availability))
	]);
	printSummary(stats, Object.keys(products).length);
	console.log(`✅ Saved ${AVAILABILITY_PATH}`);

	await purgeCache();
}

function printSummary(stats: SyncStats, total: number): void {
	console.log('\n📊 Summary:');
	console.log(`  ➕ Added:     ${stats.added}`);
	console.log(`  🔄 Updated:   ${stats.updated}`);
	console.log(`  ⏭️  Unchanged: ${stats.unchanged}`);
	console.log(`  � Removed from selection: ${stats.removed}`);
	console.log(`  🚫 Irrelevant filtered items: ${stats.filtered}`);
	console.log(`  🧹 Irrelevant filtered items (removed by sync): ${stats.filteredRemoved}`);
	console.log(`  ❌ Failed:    ${stats.failed}`);
	console.log(`  📦 Total:     ${total}\n`);
	console.log(`✅ Saved ${DATA_PATH}`);
}

sync().catch((error) => {
	console.error('❌ Fatal error:', error);
	process.exit(1);
});

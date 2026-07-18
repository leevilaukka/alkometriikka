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
  LEGACY_HEADERS,
  buildLegacyValues,
  getHash,
  getHashValues,
  isIrrelevantMainGroup,
  isIrrelevantStoredValues,
} from "./constants.ts";
import type {
  DetailedProductData,
  MigratedData,
  MigratedProduct,
  PricePoint,
  ProductDetailsApiResponse,
  ProductMeta,
  SearchApiResponse,
  SearchProductData,
} from "./types.ts";

// ============================================================================
// CONFIG & CONSTANTS
// ============================================================================

const SEARCH_URL = "https://www.alko.fi/api/search/product";
const productDetailsUrl = (id: string) => `https://www.alko.fi/api/product-api/products/${id}`;
/** When running with `--dev` we write to the local static folder and skip cache purging. */
const DEV = process.argv.includes("--dev");
/** Where the dataset is read from and written to. Mirrors the legacy setup.ts convention. */
const DATA_PATH = DEV ? "./static/data.json" : "./data.json";
/** Fallback base dataset used when no synced `data.json` exists yet (produced by migrate.ts). */
const MIGRATED_DATA_PATH = "./data-migrated.json";

/** How many products the search API returns per page. */
const PAGE_SIZE = 1000;
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

const VERBOSE = truthyEnvVar("VERBOSE");

const REQUEST_HEADERS: Record<string, string> = {
  "Accept": "application/json",
  "Content-Type": "application/json",
  "User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:147.0) Gecko/20100101 Firefox/147.0",
};

/** Column indices we read back out of a stored `values` array. */
const NUMERO_INDEX = LEGACY_HEADERS.indexOf("Numero");
const NIMI_INDEX = LEGACY_HEADERS.indexOf("Nimi");
const HINTA_INDEX = LEGACY_HEADERS.indexOf("Hinta");

interface Config {
  detailConcurrency: number;
  maxRetries: number;
  maxPages: number;
}

function truthyEnvVar(name: string): boolean {
  const value = process.env[name];
  return value === "true" || value === "1";
}

function loadConfig(): Config {
  const detailConcurrency = Math.max(1, Number(process.env.ALKO_DETAIL_CONCURRENCY) || DEFAULT_DETAIL_CONCURRENCY);
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
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const normalized = Number(value.replace(",", ".").trim());
    if (Number.isFinite(normalized)) return normalized;
  }
  return null;
}

function isMigratedProduct(entry: unknown): entry is MigratedProduct {
  return (
    !!entry &&
    typeof entry === "object" &&
    typeof (entry as MigratedProduct).hash === "string" &&
    Array.isArray((entry as MigratedProduct).values)
  );
}

/**
 * Appends today's price to the product's history when it differs from the most
 * recent recorded price. Existing history is preserved untouched otherwise.
 */
function updatePriceHistory(previous: PricePoint[] | undefined, price: number | null): PricePoint[] {
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
      const response = await fetch(url, { ...init, headers: { ...REQUEST_HEADERS, ...init.headers } });

      if (response.status === 403 || response.status === 429) {
        const backoff = Math.min(RETRY_BASE_DELAY_MS * 2 ** attempt, RETRY_MAX_DELAY_MS) + Math.random() * 500;
        console.log(`  ⏳ Rate limited (${response.status}), retry ${attempt + 1}/${maxRetries} in ${Math.round(backoff)}ms`);
        if(VERBOSE) {
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

/** Fetches every product from the paginated search API. */
async function loadSearchProducts(config: Config): Promise<SearchProductData[]> {
  const products: SearchProductData[] = [];

  for (let page = 0; page < config.maxPages; page++) {
    const skip = page * PAGE_SIZE;
    const response = await fetchJson<SearchApiResponse>(
      SEARCH_URL,
      { method: "POST", body: JSON.stringify({ top: PAGE_SIZE, skip }) },
      config.maxRetries
    );


    const batch = response?.value ?? [];
    if (batch.length === 0) break;

    products.push(...batch);

    console.log(`  📦 Fetched ${products.length} products (page ${page + 1})`);

    if (batch.length < PAGE_SIZE) break;
  }

  return products;
}

/** Fetches the full detail payload for a single product. */
async function fetchProductDetails(id: string, config: Config): Promise<DetailedProductData | null> {
  const response = await fetchJson<ProductDetailsApiResponse>(
    productDetailsUrl(id),
    { method: "GET" },
    config.maxRetries
  );
  return response?.data ?? null;
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

  if(VERBOSE) {
    console.log(`  📂 Loading existing dataset from ${sourcePath}...`);
  }

  try {
    const parsed = (await file.json()) as MigratedData;
    if (!parsed || !Array.isArray(parsed.schema)) {
      console.warn("⚠️  Existing dataset has no schema, starting fresh");
      const now = new Date().toISOString();
      return { schema: LEGACY_HEADERS, metadata: { LastUpdated: now, LastSynced: now }, products: {} };
    }
    if(VERBOSE) {
      console.log(`  ✅ Loaded file: ${sourcePath} with ${Object.keys(parsed.products ?? {}).length} products - File size: ${file.size} bytes`);
    }
    return parsed;
  } catch (error) {
    console.warn(`⚠️  Failed to read ${sourcePath}, starting fresh:`, error);
    const now = new Date().toISOString();
    return { schema: LEGACY_HEADERS, metadata: { LastUpdated: now, LastSynced: now }, products: {} };
  }
}

/**
 * Merges the search and detail payloads into a single object the schema can
 * read from. Detail-API keys win over search-API keys (see notes), while
 * price/abv/volume remain search-only fields and are preserved.
 */
function mergeProduct(search: SearchProductData, details: DetailedProductData): Record<string, unknown> {
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
    console.warn("⚠️  CLOUDFLARE_PURGE_KEY is not set. Skipping cache purge.");
    return;
  }

  console.log("🧹 Purging Cloudflare cache...");
  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${process.env.CLOUDFLARE_ZONE}/purge_cache`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${purgeKey}`,
        },
        body: JSON.stringify({ files: ["https://alkometriikka.fi/data.json"] }),
      }
    );

    if (!response.ok) {
      throw new Error(`Cache purge failed: ${response.status} ${response.statusText}`);
    }
    if(VERBOSE) {
      console.log("  ✅ Cache purge successful.", await response.json());
    }
    else {
      console.log("✅ Cache purge successful.", `Status: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    console.error("❌ Error during cache purge:", error);
  }
}

// ============================================================================
// SYNC
// ============================================================================

async function sync(): Promise<void> {
  console.log("🚀 Starting Alko sync...\n");
  const config = loadConfig();
  if(VERBOSE) {
    console.log(`  🔧 Config:`, config);
  }

  const [searchProducts, existing] = await Promise.all([
    loadSearchProducts(config),
    loadExistingData(),
  ]);

  const existingProducts = existing.products ?? {};

  console.log(`\n📦 ${searchProducts.length} products from API, ${Object.keys(existingProducts).length} in existing dataset\n`);

  const products: Record<string, MigratedProduct> = {};
  const stats: SyncStats = { unchanged: 0, updated: 0, added: 0, removed: 0, failed: 0, filtered: 0, filteredRemoved: 0 };

  // Cheap first pass: hash the search-only fields and skip anything unchanged.
  const pending: Array<{ product: SearchProductData; hash: string; previous?: MigratedProduct }> = [];

  // Ids the API classifies as irrelevant (gifts & drinking accessories).
  const irrelevantIds = new Set<string>();

  for (const product of searchProducts) {
    // Drop gifts & drinking accessories entirely: they never enter the dataset.
    if (isIrrelevantMainGroup(product as unknown as Record<string, unknown>)) {
      irrelevantIds.add(product.id);
      stats.filtered++;
      continue;
    }

    const searchHash = getHash(getHashValues(buildLegacyValues(product as unknown as Record<string, unknown>)));
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

  console.log(`🔄 ${stats.unchanged} unchanged, fetching details for ${pending.length} new/changed products...\n`);

  // Expensive second pass: fetch full details only for new/changed products.
  const totalPending = pending.length;
  let processed = 0;
  await mapWithConcurrency(pending, config.detailConcurrency, async ({ product, hash, previous }) => {
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
        const name = String(values[NIMI_INDEX] ?? "").trim() || "(nimetön)";
        const previousPrice = toNumber(previous.values[HINTA_INDEX]);
        const priceChanged = previousPrice !== null && price !== null && previousPrice !== price;
        const priceInfo = priceChanged ? ` (${previousPrice} € → ${price} €)` : "";
        // Compare the previous and current values to see what changed.
        const changedFields = values.reduce<string[]>((acc, value, index) => {
          if (previous.values[index] !== value) {
            acc.push(LEGACY_HEADERS[index]);
          }
          return acc;
        }, []);
        if (changedFields.length > 0 && VERBOSE) {
          console.log(`  🔄 Updated ${product.id} — ${name}${priceInfo}.\n\tChanged fields: \n\t${changedFields.map((f) => `\t• ${f} ${previous.values[LEGACY_HEADERS.indexOf(f as typeof LEGACY_HEADERS[number])]} → ${values[LEGACY_HEADERS.indexOf(f as typeof LEGACY_HEADERS[number])]}`).join("\n")}`);
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
  });

  // Never delete products: carry over anything missing from the latest search
  // response and flag it as removed from the selection. Only products that are
  // genuinely absent from the API response are flagged — anything the API still
  // returns is always kept as an active product.
  const apiIds = new Set(searchProducts.map((product) => product.id));
  const today = new Date().toISOString().slice(0, 10);
  for (const id of Object.keys(existingProducts)) {
    if (id in products) continue;

    const previous = existingProducts[id];
    if (!isMigratedProduct(previous)) continue;

    // Drop any existing gifts & drinking accessories: matched by the API's
    // classification (by id) or, for items no longer in the API, by the stored
    // main-group name.
    if (irrelevantIds.has(id) || isIrrelevantStoredValues(previous.values)) {
      stats.filteredRemoved++;
      continue;
    }

    // Still in the API response: keep it as-is, never mark it removed.
    if (apiIds.has(id)) {
      products[id] = previous;
    } else if (previous.meta?.removedFromSelection) {
      // Already flagged in a previous run: keep as-is.
      products[id] = previous;
    } else {
      products[id] = {
        ...previous,
        meta: { ...previous.meta, removedFromSelection: today },
      };
      stats.removed++;
    }
  }

  const now = new Date().toISOString();
  // `LastSynced` records every fetch; `LastUpdated` only moves when an actual
  // change to the data was detected this run.
  const hasChanges = stats.added > 0 || stats.updated > 0 || stats.removed > 0 || stats.filteredRemoved > 0;
  const result: MigratedData = {
    schema: LEGACY_HEADERS,
    metadata: {
      LastUpdated: hasChanges ? now : (existing.metadata?.LastUpdated ?? now),
      LastSynced: now,
    },
    products,
  };

  await Bun.write(DATA_PATH, JSON.stringify(result));
  printSummary(stats, Object.keys(products).length);

  await purgeCache();
}

function printSummary(stats: SyncStats, total: number): void {
  console.log("\n📊 Summary:");
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
  console.error("❌ Fatal error:", error);
  process.exit(1);
});


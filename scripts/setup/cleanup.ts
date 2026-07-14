/**
 * One-off cleanup: removes irrelevant products (gifts & drinking accessories,
 * mainGroup_002 / "lahja- ja juomatarvikkeet") from data-migrated.json.
 *
 * The stored dataset can't always identify these items on its own, so we
 * cross-reference the Alko search API by product id, and additionally match any
 * stored entry whose "Tyyppi" column already names the irrelevant main group.
 *
 * Usage: bun scripts/new-2026/cleanup.ts
 */

import { isIrrelevantMainGroup, isIrrelevantStoredValues } from "./constants.ts";
import type { MigratedData, MigratedProduct, SearchApiResponse, SearchProductData } from "./types.ts";

const SEARCH_URL = "https://www.alko.fi/api/search/product";
const DATA_PATH = "./data-migrated.json";
const PAGE_SIZE = 1000;

const REQUEST_HEADERS: Record<string, string> = {
  "Accept": "application/json",
  "Content-Type": "application/json",
  "User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:147.0) Gecko/20100101 Firefox/147.0",
};

function isMigratedProduct(entry: unknown): entry is MigratedProduct {
  return (
    !!entry &&
    typeof entry === "object" &&
    typeof (entry as MigratedProduct).hash === "string" &&
    Array.isArray((entry as MigratedProduct).values)
  );
}

/** Fetches every product from the paginated search API. */
async function loadSearchProducts(): Promise<SearchProductData[]> {
  const products: SearchProductData[] = [];

  for (let page = 0; ; page++) {
    const response = await fetch(SEARCH_URL, {
      method: "POST",
      headers: REQUEST_HEADERS,
      body: JSON.stringify({ top: PAGE_SIZE, skip: page * PAGE_SIZE }),
    });

    if (!response.ok) {
      throw new Error(`Search API failed: HTTP ${response.status} ${response.statusText}`);
    }

    const batch = ((await response.json()) as SearchApiResponse).value ?? [];
    if (batch.length === 0) break;

    products.push(...batch);
    console.log(`  📦 Fetched ${products.length} products (page ${page + 1})`);

    if (batch.length < PAGE_SIZE) break;
  }

  return products;
}

async function cleanup(): Promise<void> {
  console.log("🧹 Starting cleanup of irrelevant products...\n");

  const file = Bun.file(DATA_PATH);
  if (!(await file.exists())) {
    console.error(`❌ ${DATA_PATH} not found`);
    process.exit(1);
  }

  const data = (await file.json()) as MigratedData;

  const searchProducts = await loadSearchProducts();
  const irrelevantIds = new Set<string>();
  for (const product of searchProducts) {
    if (isIrrelevantMainGroup(product as unknown as Record<string, unknown>)) {
      irrelevantIds.add(product.id);
    }
  }
  console.log(`\n🔎 API classifies ${irrelevantIds.size} products as irrelevant\n`);

  const removed: string[] = [];
  for (const id of Object.keys(data)) {
    if (id === "schema") continue;

    const entry = data[id];
    if (!isMigratedProduct(entry)) continue;

    if (irrelevantIds.has(id) || isIrrelevantStoredValues(entry.values)) {
      const name = String(entry.values[1] ?? "").trim() || "(nimetön)";
      console.log(`  🗑️  Removing ${id} — ${name}`);
      removed.push(id);
      delete data[id];
    }
  }

  if (removed.length === 0) {
    console.log("✅ Nothing to clean up — no irrelevant products found");
    return;
  }

  await Bun.write(DATA_PATH, JSON.stringify(data));
  console.log(`\n📊 Unrelevant filtered items (removed by cleanup): ${removed.length}`);
  console.log(`✅ Saved ${DATA_PATH}`);
}

cleanup().catch((error) => {
  console.error("❌ Fatal error:", error);
  process.exit(1);
});

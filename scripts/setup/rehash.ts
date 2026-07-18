/**
 * TEMPORARY one-off script.
 *
 * Recomputes the change-detection `hash` for every product in `data.json`
 * in place, using the current `getHash` implementation. Run this once after
 * changing the hashing logic (e.g. the order-independent `taste` canonicalization)
 * so that stored hashes match what the next sync produces and no product is
 * needlessly re-fetched.
 *
 * The stored `values` and everything else are left untouched — only `hash` is
 * rewritten.
 *
 * Usage:
 *   bun run scripts/setup/rehash.ts          # rewrites ./data.json
 *   bun run scripts/setup/rehash.ts --dev    # rewrites ./static/data.json
 *
 * Safe to delete once the rehash has been applied everywhere.
 */

import { getHash, getHashValues } from "./constants.ts";
import type { MigratedData, MigratedProduct } from "./types.ts";

/** When running with `--dev` we operate on the local static folder. Mirrors index.ts. */
const DEV = process.argv.includes("--dev");
const DATA_PATH = DEV ? "./static/data.json" : "./data.json";

function isMigratedProduct(entry: unknown): entry is MigratedProduct {
  return (
    !!entry &&
    typeof entry === "object" &&
    typeof (entry as MigratedProduct).hash === "string" &&
    Array.isArray((entry as MigratedProduct).values)
  );
}

async function rehash(): Promise<void> {
  const file = Bun.file(DATA_PATH);
  if (!(await file.exists())) {
    throw new Error(`Dataset not found: ${DATA_PATH}`);
  }

  const data = (await file.json()) as MigratedData;
  const products = data.products ?? {};

  let changed = 0;
  let unchanged = 0;

  for (const product of Object.values(products)) {
    if (!isMigratedProduct(product)) continue;

    const newHash = getHash(getHashValues(product.values));
    if (newHash !== product.hash) {
      product.hash = newHash;
      changed++;
    } else {
      unchanged++;
    }
  }

  await Bun.write(DATA_PATH, JSON.stringify(data));

  console.log(`✅ Rehash valmis (${DATA_PATH}): ${changed} päivitetty, ${unchanged} ennallaan.`);
}

rehash().catch((err) => {
  console.error("Error during rehash:", err);
  process.exit(1);
});

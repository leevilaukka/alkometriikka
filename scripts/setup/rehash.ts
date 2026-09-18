/**
 * Recomputes the change-detection `hash` for every product in `data.json`
 * in place, using the current `getHash` implementation. Run this once after
 * changing the hashing logic (e.g. the order-independent `taste` canonicalization
 * or adding hashed columns to the schema) so that stored hashes match what the
 * next sync produces and no product is needlessly re-fetched.
 *
 * Gated by `HASH_VERSION`: hashes are only rewritten when the dataset's stored
 * `metadata.HashVersion` differs from `HASH_VERSION`. This matters because the
 * sync stores hashes derived from *search* payloads, while rehash only has the
 * stored *detail-merged* values; for hashed columns that diverge between the two
 * sources (e.g. `name`), recomputing every run would make those products look
 * changed forever. Bump `HASH_VERSION` when the hashing logic changes; the sync
 * persists the matching version so rehash becomes a no-op again.
 *
 * The fetch-data workflow runs this on the seeded dataset right before the sync,
 * so the first run after a hashing change degrades gracefully to only re-fetching
 * products whose data actually differs.
 *
 * Stored `values` are aligned to the current schema length (new columns are
 * padded with null) on every run, and the recomputed `hash` is written back
 * only when the version gate allows it; everything else is left untouched.
 *
 * Usage:
 *   bun run scripts/setup/rehash.ts          # rewrites ./data.json
 *   bun run scripts/setup/rehash.ts --dev    # rewrites ./static/data.json
 */

import { DEV, HASH_VERSION, alignValues, getHash, getHashValues } from './constants.ts';
import type { MigratedData, MigratedProduct } from './types.ts';

/** When running with `--dev` we operate on the local static folder. Mirrors index.ts. */
const DATA_PATH = DEV ? './static/data.json' : './data.json';

function isMigratedProduct(entry: unknown): entry is MigratedProduct {
	return (
		!!entry &&
		typeof entry === 'object' &&
		typeof (entry as MigratedProduct).hash === 'string' &&
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

	// Only rewrite hashes when the hash algorithm/field set has changed. Those
	// hashes are produced from search payloads by the sync, while rehash can only
	// see the stored detail-merged values — for hashed columns where the two
	// sources differ (e.g. `name` gaining a packaging suffix in search), blindly
	// recomputing every run makes the sync re-fetch those products forever.
	const shouldRehash = data.metadata?.HashVersion !== HASH_VERSION;

	let changed = 0;
	let aligned = 0;
	let unchanged = 0;

	for (const product of Object.values(products)) {
		if (!isMigratedProduct(product)) continue;

		const values = alignValues(product.values);
		if (values !== product.values) {
			product.values = values;
			aligned++;
		}

		if (!shouldRehash) continue;

		const newHash = getHash(getHashValues(product.values));
		if (newHash !== product.hash) {
			product.hash = newHash;
			changed++;
		} else {
			unchanged++;
		}
	}

	if (shouldRehash) data.metadata = { ...data.metadata, HashVersion: HASH_VERSION };

	await Bun.write(DATA_PATH, JSON.stringify(data));
	console.log(
		shouldRehash
			? `✅ Rehash valmis (${DATA_PATH}): ${changed} hashia päivitetty, ${aligned} riviä täsmäytetty, ${unchanged} ennallaan.`
			: `ℹ️  Rehash ohitettu (${DATA_PATH}): hashversio ${HASH_VERSION} ajantasalla, ${aligned} riviä täsmäytetty.`
	);
}

rehash().catch((err) => {
	console.error('Error during rehash:', err);
	process.exit(1);
});

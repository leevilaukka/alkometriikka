/**
 * Reading and writing the dataset files.
 *
 * Each product's change-detection `hash` is only used by the sync, but as 64 hex
 * characters per product it was about a third of the gzipped data.json every
 * visitor downloads. It is stored in a separate `hashes.json` next to data.json,
 * which the app never loads, along with `meta.detailCheckedAt`, also sync-only:
 *
 *   data.json    { schema, metadata, products: { id: { values, priceHistory, meta } }, index }
 *   hashes.json  { HashVersion, hashes: { id: hash }, detailCheckedAt: { id: date } }
 *
 * `readDataset` merges the two back into the in-memory `MigratedData` the sync
 * works with. Every product must end up with a hash: without one the sync would
 * treat it as new and drop its price history (or, for removed products, drop it
 * altogether). So a hash is taken, in order, from the product itself (datasets
 * written before the split), from hashes.json, or recomputed from the stored
 * values like rehash.ts does. A lost hashes.json therefore only re-fetches the
 * products whose stored values hash differently from the search payload, the
 * same one-off cost as a hash version bump. A lost `detailCheckedAt` only makes
 * the products due for re-verification, which the sync spreads over its runs.
 *
 * Products removed from the selection are written to `data-removed.json` and some columns as
 * word-list indexes (see src/lib/utils/catalog/datasetFile.ts). Unlike hashes, removed products
 * can't be recovered, so `readDataset` refuses a dataset whose removed products file is missing.
 */
import { DEV, alignValues, getHash, getHashValues, upgradeStoredValues } from './constants.ts';
import { withDatasetIndex } from './dataset-index.ts';
import type { MigratedData } from './types.ts';
import { packDataset } from '../../src/lib/utils/catalog/datasetFile.ts';
import { readStoredDataset, removedPathFor } from '../lib/stored-dataset.ts';

export const DATA_PATH = DEV ? './static/data.json' : './data.json';
export const HASHES_PATH = DEV ? './static/hashes.json' : './hashes.json';

export type HashesFile = {
	/** `metadata.HashVersion` of the dataset these hashes were written with. */
	HashVersion?: number;
	hashes: Record<string, string>;
	/** Each product's `meta.detailCheckedAt`. */
	detailCheckedAt?: Record<string, string>;
};

/** Splits the hashes and detail check dates out of the dataset. The input is left untouched. */
export function splitHashes(data: MigratedData): { data: MigratedData; hashes: HashesFile } {
	const hashes: Record<string, string> = {};
	const detailCheckedAt: Record<string, string> = {};
	const products: Record<string, unknown> = {};
	for (const [id, product] of Object.entries(data.products ?? {})) {
		if (product && typeof product === 'object') {
			const { hash, meta, ...rest } = product;
			if (typeof hash === 'string') hashes[id] = hash;
			const { detailCheckedAt: checkedAt, ...otherMeta } = meta ?? {};
			if (typeof checkedAt === 'string') detailCheckedAt[id] = checkedAt;
			products[id] = Object.keys(otherMeta).length ? { ...rest, meta: otherMeta } : rest;
		} else {
			products[id] = product;
		}
	}
	return {
		data: { ...data, products: products as MigratedData['products'] },
		hashes: { HashVersion: data.metadata?.HashVersion, hashes, detailCheckedAt }
	};
}

/**
 * Gives every product in `data` (mutated in place) a hash: its own, the one in
 * `hashes`, or one recomputed from its stored values. Returns how many came
 * from each source. Also restores `meta.detailCheckedAt` from `hashes`.
 */
export function mergeHashes(data: MigratedData, hashes: HashesFile | null | undefined) {
	const counts = { inline: 0, file: 0, recomputed: 0 };
	// Hashes written under another hash version would never match the sync's
	const fileHashes =
		hashes && hashes.HashVersion === data.metadata?.HashVersion ? (hashes.hashes ?? {}) : {};
	const fileCheckedAt = hashes?.detailCheckedAt ?? {};
	for (const [id, product] of Object.entries(data.products ?? {})) {
		if (!product || typeof product !== 'object' || !Array.isArray(product.values)) continue;
		if (!product.meta?.detailCheckedAt && typeof fileCheckedAt[id] === 'string') {
			product.meta = { ...product.meta, detailCheckedAt: fileCheckedAt[id] };
		}
		if (typeof product.hash === 'string') {
			counts.inline++;
		} else if (typeof fileHashes[id] === 'string') {
			product.hash = fileHashes[id];
			counts.file++;
		} else {
			product.hash = getHash(getHashValues(alignValues(product.values)));
			counts.recomputed++;
		}
	}
	return counts;
}

async function readJson<T>(path: string): Promise<T | null> {
	const file = Bun.file(path);
	if (!(await file.exists())) return null;
	try {
		return (await file.json()) as T;
	} catch (error) {
		console.warn(`⚠️  Failed to read ${path}:`, error);
		return null;
	}
}

/**
 * Reads a dataset and merges its hashes back in. Returns null when the dataset
 * itself is missing; a missing or unreadable hashes file is recovered from.
 */
export async function readDataset(
	dataPath: string = DATA_PATH,
	hashesPath: string = HASHES_PATH
): Promise<MigratedData | null> {
	const data = await readStoredDataset<MigratedData>(dataPath);
	if (!data) return null;
	for (const product of Object.values(data.products ?? {})) {
		if (product && typeof product === 'object' && Array.isArray(product.values)) {
			product.values = upgradeStoredValues(product.values);
		}
	}
	const counts = mergeHashes(data, await readJson<HashesFile>(hashesPath));
	if (counts.recomputed > 0) {
		console.warn(
			`⚠️  ${counts.recomputed} products had no stored hash (${hashesPath} missing or outdated); ` +
				`recomputed them from the stored values.`
		);
	}
	return data;
}

/**
 * Writes the dataset without hashes (plus the app's filter index, built over every product), its
 * removed products beside it, and the hashes.
 */
export async function writeDataset(
	data: MigratedData,
	dataPath: string = DATA_PATH,
	hashesPath: string = HASHES_PATH
): Promise<void> {
	const split = splitHashes(data);
	const packed = packDataset(withDatasetIndex(split.data));
	await Promise.all([
		Bun.write(dataPath, JSON.stringify(packed.data)),
		Bun.write(removedPathFor(dataPath), JSON.stringify(packed.removed)),
		Bun.write(hashesPath, JSON.stringify(split.hashes))
	]);
}

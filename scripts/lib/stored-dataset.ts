/**
 * Reads the dataset the way every script needs it: `data.json` and `data-removed.json` merged
 * into one dataset with every product (see src/lib/utils/catalog/datasetFile.ts).
 */
import path from 'node:path';
import {
	REMOVED_DATASET_FILE,
	expectedRemovedProducts,
	unpackDataset,
	unpackRemovedProducts
} from '../../src/lib/utils/catalog/datasetFile.ts';

async function readJson<T>(pathName: string): Promise<T | null> {
	const file = Bun.file(pathName);
	if (!(await file.exists())) return null;
	try {
		return (await file.json()) as T;
	} catch (error) {
		console.warn(`⚠️  Failed to read ${pathName}:`, error);
		return null;
	}
}

/** `data-removed.json` next to the given `data.json` */
export function removedPathFor(dataPath: string) {
	return path.join(path.dirname(dataPath), REMOVED_DATASET_FILE);
}

/**
 * Reads `data.json` and its removed products file into one dataset with every product. Throws
 * if `data.json` says there are removed products and the file is missing or doesn't hold them
 * all, so nothing works from a dataset that silently lacks them.
 */
export async function readStoredDataset<T extends object>(dataPath: string): Promise<T | null> {
	const data = await readJson<Record<string, unknown>>(dataPath);
	if (!data || typeof data !== 'object') return null;
	const expected = expectedRemovedProducts(data);
	if (!expected) return unpackDataset(data) as T;

	const removedPath = removedPathFor(dataPath);
	const removed = await readJson<unknown>(removedPath);
	const products = unpackRemovedProducts(removed, data.schema);
	const found = products ? Object.keys(products).length : 0;
	if (found !== expected) {
		throw new Error(
			`${dataPath} lists ${expected} removed products, but ${removedPath} has ${products ? found : 'none readable'}`
		);
	}
	return unpackDataset(data, removed) as T;
}

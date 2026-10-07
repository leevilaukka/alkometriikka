import { DATASET_INDEX_VERSION, Kaljakori, type DatasetIndex } from '../../src/lib/alko/index.ts';
import { parseDataset, type StoredDataset } from '../../src/lib/utils/dataset.ts';
import { AllColumns } from '../../src/lib/utils/constants.ts';
import type { DatasetRow } from '../../src/lib/types.ts';

/**
 * Precomputes the dataset columns' filter values so the browser doesn't have to
 * collect and sort them from every product on load. Built with the app's own
 * parser (Kaljakori), so the result is exactly what the app would compute.
 *
 * Stored in data.json as `index`, next to `schema`/`metadata`/`products`; older
 * app bundles ignore it. Kaljakori only uses it when its column list and product
 * counts match the dataset, so a stale index falls back to computing.
 */
/** Columns with more unique values than this share of the products are not indexed. */
const MAX_UNIQUE_RATIO = 0.1;

export function buildDatasetIndex(data: StoredDataset): DatasetIndex {
	const { index: _stale, ...withoutIndex } = data;
	const { table } = parseDataset(JSON.stringify(withoutIndex));
	const [columns] = table as [string[]];
	const kaljakori = new Kaljakori(table as DatasetRow[]);

	// Columns with mostly unique values (names, ids, prices) would roughly double
	// the download for little gain, so those are left for the browser to compute.
	const indexed = columns.filter(
		(column) => kaljakori.possibleValues[column].size <= kaljakori.data.length * MAX_UNIQUE_RATIO
	);
	const toArrays = (values: Record<string, Set<string | number>>) =>
		Object.fromEntries(indexed.map((column) => [column, Array.from(values[column])]));

	return {
		version: DATASET_INDEX_VERSION,
		columns,
		count: kaljakori.data.length,
		removedCount: kaljakori.data.filter((item) => item[AllColumns.RemovedFromSelection]).length,
		possibleValues: toArrays(kaljakori.possibleValues),
		possibleValuesActive: toArrays(kaljakori.possibleValuesActive)
	};
}

/** Returns `data` with a freshly built index, or without one if building it fails. */
export function withDatasetIndex<T extends StoredDataset>(data: T): T {
	const { index: _stale, ...rest } = data;
	try {
		return { ...rest, index: buildDatasetIndex(rest) } as T;
	} catch (error) {
		console.warn('⚠️  Could not build the dataset index, writing data.json without it:', error);
		return rest as T;
	}
}

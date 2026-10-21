import { resolve } from '$app/paths';
import {
	parseProductStockShard,
	parseStoreStockFile,
	productStockPath,
	storeStockPath,
	type ProductStockShard,
	type StoreStockFile
} from '$lib/utils/catalog/stock';

// Fetched on demand by the product and store pages. A failed or missing file
// (history not deployed yet, offline) resolves to null and the page leaves the
// section out.
const requests = new Map<string, Promise<unknown>>();

function fetchJson(path: string): Promise<unknown> {
	let request = requests.get(path);
	if (!request) {
		request = fetch(resolve('/') + path)
			.then((response) => (response.ok ? response.json() : null))
			.catch(() => null);
		requests.set(path, request);
		// Don't keep failures, so a later visit can retry
		request.then((data) => data === null && requests.delete(path));
	}
	return request;
}

export async function loadProductStock(productId: string): Promise<ProductStockShard | null> {
	return parseProductStockShard(await fetchJson(productStockPath(productId)));
}

export async function loadStoreStock(storeId: string): Promise<StoreStockFile | null> {
	return parseStoreStockFile(await fetchJson(storeStockPath(storeId)));
}

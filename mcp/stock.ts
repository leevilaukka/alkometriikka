/**
 * Reads the stock history files (`stock/products/<NN>.json`, `stock/stores/<id>.json`, see
 * docs/data/stock-history.md). They are small and numerous, so unlike the main data files they
 * are only kept in memory: a file is fetched when first needed and reused for `ttlMs`.
 * Failures are remembered briefly so a missing history costs one request, not one per call.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
	parseProductStockShard,
	parseStoreStockFile,
	productStockPath,
	storeStockPath,
	type ProductStockShard,
	type StoreStockFile
} from '../src/lib/utils/catalog/stock.ts';
import type { DataStoreOptions } from './data-store.ts';

type Entry = { at: number; data: unknown };

export class StockSource {
	private readonly cache = new Map<string, Entry>();
	private readonly now: () => number;
	private readonly fetch: NonNullable<DataStoreOptions['fetch']>;

	constructor(
		private readonly options: DataStoreOptions,
		/** How long a failure is remembered; successes are kept for `options.ttlMs`. */
		private readonly failureMs = options.retryAfterFailureMs
	) {
		this.now = options.now ?? Date.now;
		this.fetch = options.fetch ?? ((input, init) => fetch(input, init));
	}

	async productShard(productId: string): Promise<ProductStockShard | null> {
		return parseProductStockShard(await this.json(productStockPath(productId)));
	}

	async storeFile(storeId: string): Promise<StoreStockFile | null> {
		return parseStoreStockFile(await this.json(storeStockPath(storeId)));
	}

	private async json(path: string): Promise<unknown> {
		const cached = this.cache.get(path);
		if (
			cached &&
			this.now() - cached.at < (cached.data === null ? this.failureMs : this.options.ttlMs)
		)
			return cached.data;
		const data = await this.load(path);
		this.cache.set(path, { at: this.now(), data });
		return data;
	}

	private async load(path: string): Promise<unknown> {
		try {
			if (this.options.localDir) {
				return JSON.parse(await readFile(join(this.options.localDir, path), 'utf8'));
			}
			const response = await this.fetch(`${this.options.baseUrl.replace(/\/+$/, '')}/${path}`, {
				headers: { 'User-Agent': this.options.userAgent, Accept: 'application/json' },
				signal: AbortSignal.timeout(this.options.timeoutMs)
			});
			return response.ok ? await response.json() : null;
		} catch {
			return null;
		}
	}
}

/**
 * Client for the api.alkometriikka.fi Worker (workers/api, docs/api-worker.md): barcode lookups
 * and live per-store unit counts, the same answers the site's scanner and product pages get.
 *
 * Answers are kept in memory for as long as the site keeps them, so repeated tool calls don't
 * reach the Worker. That matters for a hosted server: the Worker rate-limits by IP, and all of
 * the server's users share one. Failures are kept for a minute (as the Worker keeps its own), so
 * an outage costs one request per minute per product, not one per call.
 */
import { isValidGtin } from '../src/lib/utils/catalog/gtin.ts';
import {
	parseLiveAvailability,
	type LiveStoreCounts
} from '../src/lib/utils/catalog/liveAvailability.ts';
import type { FetchLike } from './data-store.ts';

export type { LiveStoreCounts };

export type LiveApiOptions = {
	/** The Worker's origin, e.g. `https://api.alkometriikka.fi` */
	apiUrl: string;
	userAgent: string;
	timeoutMs: number;
	fetch?: FetchLike;
	now?: () => number;
};

/** A barcode's Alko product number, `not_found` when Alko has no product for it, null on failure */
export type GtinAnswer = string | 'not_found' | null;

const MINUTE = 60 * 1000;
/** Same as the scanner (`ANSWER_TTL_MS` in src/lib/utils/catalog/barcode.ts) */
const GTIN_TTL_MS = 30 * MINUTE;
/** Same as product pages (`REUSE_MS` in src/lib/utils/catalog/liveAvailability.ts) */
const AVAILABILITY_TTL_MS = 5 * MINUTE;
const FAILURE_TTL_MS = MINUTE;
/** Expired answers are swept once the cache grows past this */
const SWEEP_AT = 2000;

type Entry = { at: number; ttl: number; value: Promise<unknown> };

export class LiveApi {
	private readonly cache = new Map<string, Entry>();
	private readonly now: () => number;
	private readonly fetch: FetchLike;
	private readonly origin: string;

	constructor(private readonly options: LiveApiOptions) {
		this.now = options.now ?? Date.now;
		this.fetch = options.fetch ?? ((input, init) => fetch(input, init));
		this.origin = options.apiUrl.replace(/\/+$/, '');
	}

	/** The Alko product number for an EAN-13 (or other GTIN) barcode */
	gtin(ean: string): Promise<GtinAnswer> {
		if (!isValidGtin(ean)) return Promise.resolve('not_found');
		return this.cached(`gtin:${ean}`, GTIN_TTL_MS, async () => {
			const response = await this.get(`/gtin/${ean}`);
			if (response?.status === 404) return 'not_found';
			if (!response?.ok) return null;
			const { id } = (await response.json()) as { id?: unknown };
			return typeof id === 'string' ? id : null;
		});
	}

	/** How many units each store has of a product right now, or null when the Worker can't say */
	availability(productId: string): Promise<LiveStoreCounts | null> {
		return this.cached(`availability:${productId}`, AVAILABILITY_TTL_MS, async () => {
			const response = await this.get(`/availability/${encodeURIComponent(productId)}`);
			return response?.ok ? parseLiveAvailability(await response.json()) : null;
		});
	}

	/** Concurrent calls for the same key share one request; null answers are kept only briefly */
	private cached<T>(key: string, ttl: number, load: () => Promise<T | null>): Promise<T | null> {
		const now = this.now();
		const known = this.cache.get(key);
		if (known && now - known.at < known.ttl) return known.value as Promise<T | null>;
		if (this.cache.size >= SWEEP_AT) this.sweep(now);

		const entry: Entry = { at: now, ttl, value: Promise.resolve(null) };
		entry.value = load()
			.catch(() => null)
			.then((value) => {
				if (value === null) entry.ttl = FAILURE_TTL_MS;
				return value;
			});
		this.cache.set(key, entry);
		return entry.value as Promise<T | null>;
	}

	private sweep(now: number) {
		for (const [key, entry] of this.cache) {
			if (now - entry.at >= entry.ttl) this.cache.delete(key);
		}
	}

	private async get(path: string): Promise<Response | null> {
		try {
			return await this.fetch(`${this.origin}${path}`, {
				headers: { 'User-Agent': this.options.userAgent, Accept: 'application/json' },
				signal: AbortSignal.timeout(this.options.timeoutMs)
			});
		} catch {
			return null;
		}
	}
}

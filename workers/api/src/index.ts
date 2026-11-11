/**
 * api.alkometriikka.fi: the site's small server side. See docs/api-worker.md.
 *
 * - GET /gtin/{ean}: the Alko product number for a scanned barcode, as { id }. Alko's own data has
 *   no barcodes, so the first scan of each code asks Alko's mobile app API and keeps the answer in
 *   KV; later scans of it, and the sync, read it from there.
 * - GET /gtin/export: every stored barcode, for the sync to write into data.json. Needs the export
 *   token.
 * - GET /availability/{id}: how many units of a product each store has right now, as
 *   { fetchedAt, counts: { storeId: count } }. Alko's answer has no CORS headers and is ~200 KB
 *   per product, so the Worker trims it and keeps it in the edge cache for a few minutes.
 */

import { isValidGtin } from '../../../src/lib/utils/catalog/gtin';

// The few Workers runtime types this uses, so the Worker needs no packages of its own
interface KVListKey<M> {
	name: string;
	metadata?: M;
}
interface KVNamespace {
	getWithMetadata<M>(
		key: string,
		options?: { cacheTtl?: number }
	): Promise<{ value: string | null; metadata: M | null }>;
	put(key: string, value: string, options?: { metadata?: unknown }): Promise<void>;
	list<M>(options?: {
		prefix?: string;
		cursor?: string;
	}): Promise<{ keys: KVListKey<M>[]; list_complete: boolean; cursor?: string }>;
}
interface RateLimit {
	limit(options: { key: string }): Promise<{ success: boolean }>;
}
interface ExecutionContext {
	waitUntil(promise: Promise<unknown>): void;
}
declare const caches: { default: Cache } | undefined;

export interface Env {
	GTIN: KVNamespace;
	/** Per-IP limit on barcode lookups, so the Worker can't be used to scrape Alko through us */
	LOOKUP_LIMITER?: RateLimit;
	/** Per-IP limit on store availability requests that reach Alko */
	AVAILABILITY_LIMITER?: RateLimit;
	/** The key Alko's mobile app sends to mobile-api.alko.fi (secret) */
	ALKO_API_KEY: string;
	/** Bearer token the sync sends to /gtin/export (secret) */
	EXPORT_TOKEN: string;
}

/** What KV keeps per barcode, as the key's metadata so a listing carries it without extra reads */
export interface GtinEntry {
	id: string;
	/** When Alko last confirmed the mapping, ISO date-time */
	seenAt: string;
}

const KEY_PREFIX = 'gtin:';
const ALKO_GTIN_URL = 'https://mobile-api.alko.fi/v1/products/gtin/';
/** After this long a stored mapping is checked with Alko again, in case the product was renumbered */
const RECHECK_AFTER_MS = 90 * 24 * 60 * 60 * 1000;
/** How long a barcode Alko doesn't know stays answered from the edge cache */
const MISS_TTL_S = 24 * 60 * 60;
const UPSTREAM_TIMEOUT_MS = 8000;

const ALKO_AVAILABILITY_URL = 'https://www.alko.fi/api/product-api/availability/';
/** Alko's web API answers 403 without a browser User-Agent (same as REQUEST_HEADERS in the sync) */
const BROWSER_USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64; rv:147.0) Gecko/20100101 Firefox/147.0';
/** Store counts younger than this are served as they are */
const AVAILABILITY_FRESH_S = 15 * 60;
/** Older ones are still served while a refresh runs, or when Alko fails, up to this age */
const AVAILABILITY_STALE_S = 6 * 60 * 60;
/** How long an Alko failure answers 502 from the cache before Alko is asked again */
const AVAILABILITY_ERROR_TTL_S = 60;
/** Browsers may reuse an answer this long, so a reload doesn't count as a request */
const AVAILABILITY_BROWSER_S = 5 * 60;
const PRODUCT_ID = /^\d{3,8}$/;

/** A product's store counts, as the Worker caches and returns them */
export interface LiveAvailability {
	/** When Alko gave the counts, ISO date-time */
	fetchedAt: string;
	/** Store id → units in stock, only stores that have some */
	counts: Record<string, number>;
}

function edgeCache(): Cache | undefined {
	return typeof caches === 'undefined' ? undefined : caches.default;
}

function json(body: unknown, status = 200, cacheSeconds = 0): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			'Content-Type': 'application/json; charset=utf-8',
			// Product numbers are public, so any origin may read them; the rate limit is what guards Alko
			'Access-Control-Allow-Origin': '*',
			'Cache-Control': cacheSeconds > 0 ? `public, max-age=${cacheSeconds}` : 'no-store'
		}
	});
}

type AlkoLookup = { found: true; id: string } | { found: false } | { error: string };

async function askAlko(ean: string, env: Env): Promise<AlkoLookup> {
	let response: Response;
	try {
		response = await fetch(`${ALKO_GTIN_URL}${ean}?lang=fi`, {
			headers: {
				Accept: 'application/json',
				'x-api-key': env.ALKO_API_KEY
			},
			signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
		});
	} catch (error) {
		return { error: `request failed: ${error}` };
	}
	if (response.status === 404) return { found: false };
	if (!response.ok) return { error: `status ${response.status}` };
	const body = (await response.json().catch(() => null)) as { id?: unknown } | null;
	const id = body?.id == null ? '' : String(body.id);
	return /^\d{3,8}$/.test(id) ? { found: true, id } : { error: 'no product number in response' };
}

/** A failed write (the free plan's 1,000 a day) only costs the next scan another Alko lookup */
async function remember(ean: string, id: string, env: Env): Promise<void> {
	const entry: GtinEntry = { id, seenAt: new Date().toISOString() };
	try {
		await env.GTIN.put(KEY_PREFIX + ean, id, { metadata: entry });
	} catch (error) {
		console.error(`Couldn't store ${ean}: ${error}`);
	}
}

/** True when the request's IP may still reach Alko through `limiter` (always, without one) */
async function underLimit(limiter: RateLimit | undefined, request: Request): Promise<boolean> {
	if (!limiter) return true;
	const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
	return (await limiter.limit({ key: ip })).success;
}

function missKey(ean: string): Request {
	return new Request(`https://api.alkometriikka.fi/gtin/__miss/${ean}`);
}

async function lookup(ean: string, request: Request, env: Env, ctx: ExecutionContext) {
	if (!isValidGtin(ean)) return json({ error: 'invalid_gtin' }, 400);

	const stored = await env.GTIN.getWithMetadata<GtinEntry>(KEY_PREFIX + ean, { cacheTtl: 3600 });
	if (stored.value) {
		const seenAt = Date.parse(stored.metadata?.seenAt ?? '');
		if (!(Date.now() - seenAt < RECHECK_AFTER_MS)) {
			ctx.waitUntil(
				askAlko(ean, env).then((result) =>
					'found' in result && result.found ? remember(ean, result.id, env) : undefined
				)
			);
		}
		return json({ id: stored.value }, 200, 86400);
	}

	const cache = edgeCache();
	if (await cache?.match(missKey(ean))) return json({ error: 'not_found' }, 404, 3600);

	// Only lookups that reach Alko count towards the limit
	if (!(await underLimit(env.LOOKUP_LIMITER, request))) {
		return json({ error: 'rate_limited' }, 429);
	}

	const result = await askAlko(ean, env);
	if ('error' in result) {
		console.error(`Alko GTIN lookup for ${ean} failed: ${result.error}`);
		return json({ error: 'upstream' }, 502);
	}
	if (!result.found) {
		if (cache) {
			const miss = new Response(null, { headers: { 'Cache-Control': `max-age=${MISS_TTL_S}` } });
			ctx.waitUntil(cache.put(missKey(ean), miss));
		}
		return json({ error: 'not_found' }, 404, 3600);
	}
	await remember(ean, result.id, env);
	return json({ id: result.id }, 200, 86400);
}

function availabilityKey(kind: 'counts' | 'error', id: string): Request {
	return new Request(`https://api.alkometriikka.fi/availability/__${kind}/${id}`);
}

type AlkoStock = { counts: Record<string, number> } | { error: string };

/**
 * Every store's count of the product from Alko's web API. Alko answers an unknown product with an
 * empty list, the same as one no store has, so both give no counts.
 */
async function askAlkoStock(id: string): Promise<AlkoStock> {
	let response: Response;
	try {
		response = await fetch(`${ALKO_AVAILABILITY_URL}${id}`, {
			headers: { Accept: 'application/json', 'User-Agent': BROWSER_USER_AGENT },
			signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
		});
	} catch (error) {
		return { error: `request failed: ${error}` };
	}
	if (!response.ok) return { error: `status ${response.status}` };
	const body: unknown = await response.json().catch(() => null);
	if (!Array.isArray(body)) return { error: 'no store list in response' };
	const counts: Record<string, number> = {};
	for (const store of body) {
		if (!store || typeof store !== 'object') continue;
		const { id: storeId, count, outletType } = store as Record<string, unknown>;
		// Pickup points aren't stores, and availability.json leaves them out too
		if (String(outletType) === '2') continue;
		const key = String(storeId ?? '');
		if (/^\d+$/.test(key) && typeof count === 'number' && Number.isFinite(count) && count > 0) {
			counts[key] = count;
		}
	}
	return { counts };
}

/** A failed cache write only costs the next request another Alko fetch */
async function cachePut(cache: Cache | undefined, key: Request, response: Response) {
	try {
		await cache?.put(key, response);
	} catch (error) {
		console.error(`Couldn't cache ${key.url}: ${error}`);
	}
}

/** Fetches the counts and caches them, or caches the failure briefly. Null when Alko failed. */
async function refreshAvailability(
	id: string,
	cache: Cache | undefined
): Promise<LiveAvailability | null> {
	const result = await askAlkoStock(id);
	if ('error' in result) {
		console.error(`Alko availability for ${id} failed: ${result.error}`);
		const failure = new Response(null, {
			headers: { 'Cache-Control': `max-age=${AVAILABILITY_ERROR_TTL_S}` }
		});
		await cachePut(cache, availabilityKey('error', id), failure);
		return null;
	}
	const live: LiveAvailability = { fetchedAt: new Date().toISOString(), counts: result.counts };
	const stored = new Response(JSON.stringify(live), {
		headers: {
			'Content-Type': 'application/json',
			'Cache-Control': `max-age=${AVAILABILITY_STALE_S}`
		}
	});
	await cachePut(cache, availabilityKey('counts', id), stored);
	return live;
}

async function cachedAvailability(
	cache: Cache | undefined,
	id: string
): Promise<LiveAvailability | null> {
	const hit = await cache?.match(availabilityKey('counts', id));
	const body = (await hit?.json().catch(() => null)) as Partial<LiveAvailability> | null;
	return typeof body?.fetchedAt === 'string' && body.counts && typeof body.counts === 'object'
		? (body as LiveAvailability)
		: null;
}

/**
 * Fresh counts come straight from the cache. Stale ones are served while a refresh runs in the
 * background, and keep being served while Alko fails or the IP is over its limit. Only requests
 * that would reach Alko count towards the limit.
 */
async function availability(id: string, request: Request, env: Env, ctx: ExecutionContext) {
	if (!PRODUCT_ID.test(id)) return json({ error: 'invalid_id' }, 400);

	const cache = edgeCache();
	const cached = await cachedAvailability(cache, id);
	const ageS = cached ? (Date.now() - Date.parse(cached.fetchedAt)) / 1000 : NaN;
	if (cached && ageS < AVAILABILITY_FRESH_S) {
		const browserS = Math.min(AVAILABILITY_BROWSER_S, AVAILABILITY_FRESH_S - ageS);
		return json(cached, 200, Math.max(1, Math.ceil(browserS)));
	}
	const stale = cached && ageS < AVAILABILITY_STALE_S ? cached : null;

	const failedRecently = Boolean(await cache?.match(availabilityKey('error', id)));
	const mayAsk = !failedRecently && (await underLimit(env.AVAILABILITY_LIMITER, request));
	if (stale) {
		if (mayAsk) ctx.waitUntil(refreshAvailability(id, cache));
		return json(stale, 200, 60);
	}
	if (failedRecently) return json({ error: 'upstream' }, 502);
	if (!mayAsk) return json({ error: 'rate_limited' }, 429);

	const live = await refreshAvailability(id, cache);
	return live ? json(live, 200, AVAILABILITY_BROWSER_S) : json({ error: 'upstream' }, 502);
}

/** Constant-time, so the token can't be guessed a character at a time from response times */
function tokensMatch(given: string, expected: string): boolean {
	const a = new TextEncoder().encode(given);
	const b = new TextEncoder().encode(expected);
	let diff = a.length ^ b.length;
	for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
	return diff === 0 && expected.length > 0;
}

async function exportAll(request: Request, env: Env): Promise<Response> {
	const auth = request.headers.get('Authorization') ?? '';
	if (!tokensMatch(auth.replace(/^Bearer /, ''), env.EXPORT_TOKEN ?? '')) {
		return json({ error: 'unauthorized' }, 401);
	}
	const entries: ({ ean: string } & GtinEntry)[] = [];
	let cursor: string | undefined;
	do {
		const page = await env.GTIN.list<GtinEntry>({ prefix: KEY_PREFIX, cursor });
		for (const key of page.keys) {
			if (key.metadata) entries.push({ ean: key.name.slice(KEY_PREFIX.length), ...key.metadata });
		}
		cursor = page.list_complete ? undefined : page.cursor;
	} while (cursor);
	return json({ entries });
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const { pathname } = new URL(request.url);
		if (request.method === 'OPTIONS') {
			return new Response(null, {
				status: 204,
				headers: {
					'Access-Control-Allow-Origin': '*',
					'Access-Control-Allow-Methods': 'GET',
					'Access-Control-Max-Age': '86400'
				}
			});
		}
		if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);
		if (pathname === '/gtin/export') return exportAll(request, env);
		const match = pathname.match(/^\/gtin\/([^/]+)\/?$/);
		if (match) return lookup(match[1], request, env, ctx);
		const stock = pathname.match(/^\/availability\/([^/]+)\/?$/);
		if (stock) return availability(stock[1], request, env, ctx);
		return json({ error: 'not_found' }, 404);
	}
};

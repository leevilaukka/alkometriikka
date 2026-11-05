/**
 * api.alkometriikka.fi: the site's small server side. See docs/api-worker.md.
 *
 * - GET /gtin/{ean}: the Alko product number for a scanned barcode, as { id }. Alko's own data has
 *   no barcodes, so the first scan of each code asks Alko's mobile app API and keeps the answer in
 *   KV; later scans of it, and the sync, read it from there.
 * - GET /gtin/export: every stored barcode, for the sync to write into data.json. Needs the export
 *   token.
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

	const cache = typeof caches === 'undefined' ? undefined : caches.default;
	if (await cache?.match(missKey(ean))) return json({ error: 'not_found' }, 404, 3600);

	// Only lookups that reach Alko count towards the limit
	const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
	if (env.LOOKUP_LIMITER && !(await env.LOOKUP_LIMITER.limit({ key: ip })).success) {
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
		return json({ error: 'not_found' }, 404);
	}
};

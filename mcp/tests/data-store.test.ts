import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	CachedResource,
	DataUnavailableError,
	type DataStoreOptions,
	type FetchLike
} from '../data-store.ts';
import { CatalogProvider } from '../provider.ts';
import { FIXTURE_DIR, fixtureText, quietly } from './helpers.ts';

const MINUTE = 60 * 1000;

type Call = { url: string; headers: Record<string, string> };

/** A scripted fetch: each call consumes the next handler (or repeats the last one). */
function scriptedFetch(...handlers: ((call: Call) => Response | Promise<Response>)[]) {
	const calls: Call[] = [];
	const fetch: FetchLike = async (url, init) => {
		const call = { url, headers: (init?.headers ?? {}) as Record<string, string> };
		calls.push(call);
		const handler = handlers[Math.min(calls.length - 1, handlers.length - 1)]!;
		return handler(call);
	};
	return { fetch, calls };
}

const json =
	(body: string, headers: Record<string, string> = {}) =>
	() =>
		new Response(body, {
			status: 200,
			headers: { 'content-type': 'application/json', ...headers }
		});
const status = (code: number) => () => new Response(null, { status: code });
const networkError = () => {
	throw new TypeError('fetch failed');
};

let dir: string;
let clock: number;

function options(fetch: FetchLike, overrides: Partial<DataStoreOptions> = {}): DataStoreOptions {
	return {
		baseUrl: 'https://example.test',
		cacheDir: dir,
		ttlMs: 60 * MINUTE,
		retryAfterFailureMs: 5 * MINUTE,
		timeoutMs: 1000,
		userAgent: 'test-agent',
		fetch,
		now: () => clock,
		...overrides
	};
}

const validJson = (text: string) => {
	JSON.parse(text);
};

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'alkometriikka-mcp-test-'));
	clock = Date.UTC(2026, 8, 20, 12);
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

describe('CachedResource', () => {
	it('downloads once and serves from cache within the TTL', async () => {
		const { fetch, calls } = scriptedFetch(json('{"a":1}', { etag: '"v1"' }));
		const resource = new CachedResource('data.json', options(fetch), validJson);

		const first = await resource.load();
		expect(first.source).toBe('network');
		expect(readFileSync(first.path, 'utf8')).toBe('{"a":1}');
		expect(calls[0]!.url).toBe('https://example.test/data.json');
		expect(calls[0]!.headers['User-Agent']).toBe('test-agent');

		clock += 30 * MINUTE;
		const second = await resource.load();
		expect(second.source).toBe('cache');
		expect(second.version).toBe(first.version);
		expect(calls).toHaveLength(1);
	});

	it('reuses the on-disk cache across instances (server restarts)', async () => {
		const first = scriptedFetch(json('{"a":1}'));
		await new CachedResource('data.json', options(first.fetch), validJson).load();

		const second = scriptedFetch(networkError);
		const state = await new CachedResource('data.json', options(second.fetch), validJson).load();
		expect(state.source).toBe('cache');
		expect(second.calls).toHaveLength(0);
	});

	it('revalidates with conditional headers after the TTL', async () => {
		const { fetch, calls } = scriptedFetch(
			json('{"a":1}', { etag: '"v1"', 'last-modified': 'Sun, 20 Sep 2026 10:00:00 GMT' }),
			status(304)
		);
		const resource = new CachedResource('data.json', options(fetch), validJson);
		const first = await resource.load();

		clock += 61 * MINUTE;
		const second = await resource.load();
		expect(calls[1]!.headers['If-None-Match']).toBe('"v1"');
		expect(calls[1]!.headers['If-Modified-Since']).toBe('Sun, 20 Sep 2026 10:00:00 GMT');
		expect(second.source).toBe('cache');
		expect(second.stale).toBe(false);
		expect(second.version).toBe(first.version);

		// The 304 renewed the TTL.
		clock += 30 * MINUTE;
		await resource.load();
		expect(calls).toHaveLength(2);
	});

	it('replaces the cache when the file changed', async () => {
		const { fetch } = scriptedFetch(
			json('{"a":1}', { etag: '"v1"' }),
			json('{"a":2}', { etag: '"v2"' })
		);
		const resource = new CachedResource('data.json', options(fetch), validJson);
		const first = await resource.load();
		clock += 61 * MINUTE;
		const second = await resource.load();
		expect(second.source).toBe('network');
		expect(second.version).not.toBe(first.version);
		expect(readFileSync(second.path, 'utf8')).toBe('{"a":2}');
	});

	it('serves the stale cache on failure and backs off before retrying', async () => {
		const { fetch, calls } = scriptedFetch(json('{"a":1}'), networkError, json('{"a":2}'));
		const resource = new CachedResource('data.json', options(fetch), validJson);
		await resource.load();

		clock += 61 * MINUTE;
		const failed = await resource.load();
		expect(failed.stale).toBe(true);
		expect(failed.warning).toContain('fetch failed');
		expect(readFileSync(failed.path, 'utf8')).toBe('{"a":1}');

		// Within the back-off window the network is not touched again.
		clock += 1 * MINUTE;
		expect((await resource.load()).stale).toBe(true);
		expect(calls).toHaveLength(2);

		clock += 5 * MINUTE;
		const recovered = await resource.load();
		expect(recovered.stale).toBe(false);
		expect(readFileSync(recovered.path, 'utf8')).toBe('{"a":2}');
	});

	it('treats HTTP errors as failures', async () => {
		const { fetch } = scriptedFetch(json('{"a":1}'), status(503));
		const resource = new CachedResource('data.json', options(fetch), validJson);
		await resource.load();
		clock += 61 * MINUTE;
		const state = await resource.load();
		expect(state.stale).toBe(true);
		expect(state.warning).toContain('HTTP 503');
	});

	it('never caches invalid content', async () => {
		const { fetch } = scriptedFetch(json('<html>oops</html>'));
		const resource = new CachedResource('data.json', options(fetch), validJson);
		await expect(resource.load()).rejects.toBeInstanceOf(DataUnavailableError);
		expect(existsSync(join(dir, 'data.json'))).toBe(false);
	});

	it('fails cleanly without a cache, and does not retry immediately', async () => {
		const { fetch, calls } = scriptedFetch(networkError);
		const resource = new CachedResource('data.json', options(fetch), validJson);
		await expect(resource.load()).rejects.toThrow(/no cached copy/);
		await expect(resource.load()).rejects.toThrow(/Not retrying until/);
		expect(calls).toHaveLength(1);
	});

	it('ignores a cache downloaded from a different base URL', async () => {
		const first = scriptedFetch(json('{"a":1}'));
		await new CachedResource('data.json', options(first.fetch), validJson).load();

		const second = scriptedFetch(json('{"a":2}'));
		const state = await new CachedResource(
			'data.json',
			options(second.fetch, { baseUrl: 'https://mirror.test' }),
			validJson
		).load();
		expect(second.calls).toHaveLength(1);
		expect(state.source).toBe('network');
	});

	it('reads a local directory without using the network', async () => {
		const { fetch, calls } = scriptedFetch(networkError);
		const resource = new CachedResource(
			'data.json',
			options(fetch, { localDir: FIXTURE_DIR }),
			validJson
		);
		const state = await resource.load();
		expect(state.source).toBe('local');
		expect(state.path).toBe(join(FIXTURE_DIR, 'data.json'));
		expect(calls).toHaveLength(0);

		const missing = new CachedResource('data.json', options(fetch, { localDir: dir }), validJson);
		await expect(missing.load()).rejects.toBeInstanceOf(DataUnavailableError);
	});
});

describe('CatalogProvider', () => {
	const serveFixtures = (availability: (call: Call) => Response) =>
		scriptedFetch((call) =>
			call.url.endsWith('/data.json') ? json(fixtureText('data.json'))() : availability(call)
		);

	it('builds the catalog from downloaded files and reuses it', async () => {
		const { fetch, calls } = serveFixtures(json(fixtureText('availability.json')));
		const provider = new CatalogProvider(options(fetch));
		const catalog = await quietly(() => provider.get());
		expect(catalog.getProduct('100001').product.store_count).toBe(2);
		expect(catalog.status).toMatchObject({
			last_updated: '2026-09-20T10:00:00.000Z',
			availability_last_updated: '2026-09-20T12:00:00.000Z',
			source: 'https://example.test',
			stale: false
		});
		expect(await provider.get()).toBe(catalog);
		expect(calls).toHaveLength(2);
	});

	it('shares one refresh between concurrent callers', async () => {
		const { fetch, calls } = serveFixtures(json(fixtureText('availability.json')));
		const provider = new CatalogProvider(options(fetch));
		const [a, b] = await quietly(() => Promise.all([provider.get(), provider.get()]));
		expect(a).toBe(b);
		expect(calls).toHaveLength(2);
	});

	it('works without availability data', async () => {
		const { fetch } = serveFixtures(status(404));
		const catalog = await quietly(() => new CatalogProvider(options(fetch)).get());
		expect(catalog.search({ query: 'testiviina' }).total_matches).toBe(1);
		expect(catalog.status.warnings?.[0]).toContain('Store availability is unavailable');
		expect(catalog.storeAvailability('100001', { limit: 5 }).availability_data_loaded).toBe(false);
	});

	it('rejects with a clear error when the dataset cannot be loaded', async () => {
		const { fetch } = scriptedFetch(networkError);
		await expect(new CatalogProvider(options(fetch)).get()).rejects.toThrow(
			/Could not download https:\/\/example.test\/data.json/
		);
	});

	it('flags stale data when a refresh fails', async () => {
		let online = true;
		const fetch: FetchLike = async (url) => {
			if (!online) throw new TypeError('fetch failed');
			return new Response(
				fixtureText(url.endsWith('/data.json') ? 'data.json' : 'availability.json')
			);
		};
		const provider = new CatalogProvider(options(fetch));
		const catalog = await quietly(() => provider.get());

		online = false;
		clock += 61 * MINUTE;
		const stale = await provider.get();
		expect(stale).toBe(catalog);
		expect(stale.status.stale).toBe(true);
		expect(stale.status.warnings?.length).toBe(2);
	});
});

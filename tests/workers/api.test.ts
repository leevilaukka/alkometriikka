import { afterEach, beforeEach, describe, expect, it, mock, setSystemTime } from 'bun:test';
import worker, { type Env, type GtinEntry } from '../../workers/api/src/index';
import { isValidGtin } from '../../src/lib/utils/catalog/gtin';

const JAMESON = '5011007017965';

/** KV in memory, with the metadata kept like Cloudflare's */
function memoryKV(initial: Record<string, GtinEntry> = {}) {
	const store = new Map(
		Object.entries(initial).map(([ean, entry]) => [
			`gtin:${ean}`,
			{ value: entry.id, metadata: entry }
		])
	);
	return {
		store,
		async getWithMetadata(key: string) {
			const hit = store.get(key);
			return { value: hit?.value ?? null, metadata: hit?.metadata ?? null };
		},
		async put(key: string, value: string, options?: { metadata?: unknown }) {
			store.set(key, { value, metadata: options?.metadata as GtinEntry });
		},
		async list({ prefix = '', cursor }: { prefix?: string; cursor?: string } = {}) {
			// Pages of two, to exercise the cursor
			const names = [...store.keys()].filter((name) => name.startsWith(prefix)).sort();
			const start = cursor ? Number(cursor) : 0;
			const keys = names
				.slice(start, start + 2)
				.map((name) => ({ name, metadata: store.get(name)!.metadata }));
			const done = start + 2 >= names.length;
			return { keys, list_complete: done, cursor: done ? undefined : String(start + 2) };
		}
	};
}

function env(kv = memoryKV(), overrides: Partial<Env> = {}): Env {
	return { GTIN: kv, ALKO_API_KEY: 'app-key', EXPORT_TOKEN: 'secret', ...overrides } as Env;
}

const pending: Promise<unknown>[] = [];
const ctx = { waitUntil: (promise: Promise<unknown>) => void pending.push(promise) };

function get(path: string, headers: Record<string, string> = {}, e = env()) {
	return worker.fetch(new Request(`https://api.alkometriikka.fi${path}`, { headers }), e, ctx);
}

const realFetch = globalThis.fetch;
let alko: ReturnType<typeof mock>;

function alkoAnswers(status: number, body: unknown = {}) {
	alko = mock(async () => new Response(JSON.stringify(body), { status }));
	globalThis.fetch = alko as unknown as typeof fetch;
}

beforeEach(() => alkoAnswers(200, { id: '200047', name: 'Jameson Single Pot Still' }));
afterEach(async () => {
	await Promise.all(pending.splice(0));
	globalThis.fetch = realFetch;
});

describe('isValidGtin', () => {
	it('accepts codes with a correct check digit', () => {
		expect(isValidGtin(JAMESON)).toBe(true);
		expect(isValidGtin('6412700709703')).toBe(true);
		expect(isValidGtin('0000064030302')).toBe(true);
		expect(isValidGtin('96385074')).toBe(true); // GTIN-8
	});

	it('rejects a wrong check digit, other lengths and non-digits', () => {
		expect(isValidGtin('5011007017964')).toBe(false);
		expect(isValidGtin('501100701796')).toBe(false);
		expect(isValidGtin('50110070179a5')).toBe(false);
		expect(isValidGtin('')).toBe(false);
	});
});

describe('GET /gtin/{ean}', () => {
	it('asks Alko once, stores the answer and serves it from KV after that', async () => {
		const kv = memoryKV();
		const e = env(kv);
		const first = await get(`/gtin/${JAMESON}`, {}, e);
		expect(first.status).toBe(200);
		expect(await first.json()).toEqual({ id: '200047' });
		expect(first.headers.get('Access-Control-Allow-Origin')).toBe('*');
		expect(alko).toHaveBeenCalledTimes(1);
		const [url, init] = alko.mock.calls[0] as [string, RequestInit];
		expect(url).toBe(`https://mobile-api.alko.fi/v1/products/gtin/${JAMESON}?lang=fi`);
		expect((init.headers as Record<string, string>)['x-api-key']).toBe('app-key');
		expect(kv.store.get(`gtin:${JAMESON}`)?.metadata.id).toBe('200047');

		const second = await get(`/gtin/${JAMESON}`, {}, e);
		expect(await second.json()).toEqual({ id: '200047' });
		expect(alko).toHaveBeenCalledTimes(1);
	});

	it('rechecks an old mapping in the background but answers from KV', async () => {
		const kv = memoryKV({ [JAMESON]: { id: '928201', seenAt: '2025-01-01T00:00:00.000Z' } });
		const response = await get(`/gtin/${JAMESON}`, {}, env(kv));
		expect(await response.json()).toEqual({ id: '928201' });
		await Promise.all(pending.splice(0));
		expect(alko).toHaveBeenCalledTimes(1);
		expect(kv.store.get(`gtin:${JAMESON}`)?.value).toBe('200047');
	});

	it('still answers when KV refuses the write', async () => {
		const kv = memoryKV();
		kv.put = async () => {
			throw new Error('KV put() limit exceeded for the day.');
		};
		const response = await get(`/gtin/${JAMESON}`, {}, env(kv));
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ id: '200047' });
	});

	it('rejects an invalid code without asking Alko', async () => {
		const response = await get('/gtin/5011007017964');
		expect(response.status).toBe(400);
		expect(alko).not.toHaveBeenCalled();
	});

	it('passes on a product Alko does not know as 404, without storing it', async () => {
		alkoAnswers(404);
		const kv = memoryKV();
		const response = await get(`/gtin/${JAMESON}`, {}, env(kv));
		expect(response.status).toBe(404);
		expect(kv.store.size).toBe(0);
	});

	it('answers 502 when Alko refuses the key or sends no product number', async () => {
		alkoAnswers(403, { error: 'Unauthorized' });
		expect((await get(`/gtin/${JAMESON}`)).status).toBe(502);
		alkoAnswers(200, { name: 'no id' });
		expect((await get(`/gtin/${JAMESON}`)).status).toBe(502);
	});

	it('rate limits lookups that would reach Alko', async () => {
		const limiter = { limit: async () => ({ success: false }) };
		const response = await get(
			`/gtin/${JAMESON}`,
			{},
			env(memoryKV(), { LOOKUP_LIMITER: limiter })
		);
		expect(response.status).toBe(429);
		expect(alko).not.toHaveBeenCalled();
	});
});

describe('GET /gtin/export', () => {
	const entries = {
		[JAMESON]: { id: '200047', seenAt: '2026-11-05T22:00:00.000Z' },
		'6412700709703': { id: '300014', seenAt: '2026-11-05T22:01:00.000Z' },
		'4067700017802': { id: '927862', seenAt: '2026-11-05T22:02:00.000Z' }
	};

	it('lists every stored barcode across pages', async () => {
		const response = await get(
			'/gtin/export',
			{ Authorization: 'Bearer secret' },
			env(memoryKV(entries))
		);
		expect(response.status).toBe(200);
		const body = (await response.json()) as { entries: { ean: string; id: string }[] };
		expect(body.entries.map((entry) => [entry.ean, entry.id]).sort()).toEqual([
			['4067700017802', '927862'],
			[JAMESON, '200047'],
			['6412700709703', '300014']
		]);
	});

	it('needs the token', async () => {
		const e = env(memoryKV(entries));
		expect((await get('/gtin/export', {}, e)).status).toBe(401);
		expect((await get('/gtin/export', { Authorization: 'Bearer wrong' }, e)).status).toBe(401);
		const unset = env(memoryKV(entries), { EXPORT_TOKEN: '' });
		expect((await get('/gtin/export', { Authorization: 'Bearer ' }, unset)).status).toBe(401);
	});
});

describe('GET /availability/{id}', () => {
	/** caches.default in memory; ignores max-age, which the tests move past with the clock instead */
	function memoryCache() {
		const entries = new Map<string, Response>();
		return {
			entries,
			async match(request: Request) {
				return entries.get(request.url)?.clone();
			},
			async put(request: Request, response: Response) {
				entries.set(request.url, response.clone());
			}
		};
	}

	const ALKO_STORES = [
		{ id: '2102', count: 9, outletType: '1', storeName: 'Helsinki Kamppi', openHours: [] },
		{ id: '2256', count: 66, outletType: '1', storeName: 'Ulvila', openHours: [] },
		{ id: '9001', count: 3, outletType: '2', storeName: 'Noutopiste' },
		{ id: '2286', count: 0, outletType: '1', storeName: 'Empty' }
	];
	const START = new Date('2026-11-08T12:00:00.000Z');
	const realCaches = (globalThis as { caches?: unknown }).caches;
	let cache: ReturnType<typeof memoryCache>;

	beforeEach(() => {
		cache = memoryCache();
		(globalThis as { caches?: unknown }).caches = { default: cache };
		setSystemTime(START);
		alkoAnswers(200, ALKO_STORES);
	});
	afterEach(() => {
		(globalThis as { caches?: unknown }).caches = realCaches;
		setSystemTime();
	});

	const minutes = (n: number) => new Date(START.getTime() + n * 60_000);

	it('asks Alko, trims the answer to store counts and serves it from the cache after that', async () => {
		const first = await get('/availability/100151');
		expect(first.status).toBe(200);
		expect(first.headers.get('Access-Control-Allow-Origin')).toBe('*');
		expect(first.headers.get('Cache-Control')).toBe('public, max-age=300');
		expect(await first.json()).toEqual({
			fetchedAt: START.toISOString(),
			counts: { '2102': 9, '2256': 66 }
		});
		const [url, init] = alko.mock.calls[0] as [string, RequestInit];
		expect(url).toBe('https://www.alko.fi/api/product-api/availability/100151');
		expect((init.headers as Record<string, string>)['User-Agent']).toContain('Firefox');

		setSystemTime(minutes(12));
		const second = await get('/availability/100151');
		expect((await second.json()) as unknown).toMatchObject({ counts: { '2102': 9 } });
		// What's left of the 15 fresh minutes
		expect(second.headers.get('Cache-Control')).toBe('public, max-age=180');
		expect(alko).toHaveBeenCalledTimes(1);
	});

	it('serves stale counts while refreshing them in the background', async () => {
		await get('/availability/100151');
		alkoAnswers(200, [{ id: '2102', count: 4, outletType: '1' }]);
		setSystemTime(minutes(20));

		const stale = await get('/availability/100151');
		expect(await stale.json()).toEqual({
			fetchedAt: START.toISOString(),
			counts: { '2102': 9, '2256': 66 }
		});
		expect(stale.headers.get('Cache-Control')).toBe('public, max-age=60');
		await Promise.all(pending.splice(0));
		expect(alko).toHaveBeenCalledTimes(1);

		const refreshed = await get('/availability/100151');
		expect(await refreshed.json()).toEqual({
			fetchedAt: minutes(20).toISOString(),
			counts: { '2102': 4 }
		});
	});

	it('answers a product no store has, or Alko does not know, with no counts', async () => {
		alkoAnswers(200, []);
		const response = await get('/availability/999999');
		expect(response.status).toBe(200);
		expect(((await response.json()) as { counts: unknown }).counts).toEqual({});
	});

	it('answers 502 when Alko fails, and does not ask again for a minute', async () => {
		alkoAnswers(403, '');
		expect((await get('/availability/100151')).status).toBe(502);
		alkoAnswers(200, { not: 'a list' });
		expect((await get('/availability/100151')).status).toBe(502);
		expect(alko).not.toHaveBeenCalled();
	});

	it('keeps serving stale counts when Alko fails', async () => {
		await get('/availability/100151');
		alkoAnswers(500, '');
		setSystemTime(minutes(60));
		const response = await get('/availability/100151');
		expect(response.status).toBe(200);
		expect(((await response.json()) as { counts: unknown }).counts).toEqual({
			'2102': 9,
			'2256': 66
		});
	});

	it('rejects an invalid product number without asking Alko', async () => {
		expect((await get('/availability/12ab')).status).toBe(400);
		expect((await get('/availability/123456789')).status).toBe(400);
		expect(alko).not.toHaveBeenCalled();
	});

	it('rate limits only requests that would reach Alko', async () => {
		const limiter = { limit: mock(async () => ({ success: false })) };
		const limited = env(memoryKV(), { AVAILABILITY_LIMITER: limiter });
		expect((await get('/availability/100151', {}, limited)).status).toBe(429);
		expect(alko).not.toHaveBeenCalled();

		await get('/availability/100151');
		const cached = await get('/availability/100151', {}, limited);
		expect(cached.status).toBe(200);
		expect(limiter.limit).toHaveBeenCalledTimes(1);

		// Stale counts are still served over the limit, just not refreshed
		setSystemTime(minutes(20));
		expect((await get('/availability/100151', {}, limited)).status).toBe(200);
		expect(alko).toHaveBeenCalledTimes(1);
	});
});

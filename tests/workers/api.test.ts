import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
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

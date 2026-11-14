import { beforeEach, describe, expect, it } from 'bun:test';
import {
	clearLiveAvailability,
	loadLiveAvailability,
	parseLiveAvailability
} from '$lib/utils/catalog/liveAvailability';

const FETCHED_AT = '2026-11-08T12:00:00.000Z';

function worker(status: number, body: unknown = {}) {
	const calls: string[] = [];
	const fetchFn = (async (url: string) => {
		calls.push(url);
		return new Response(JSON.stringify(body), { status });
	}) as unknown as typeof fetch;
	return { calls, fetchFn };
}

beforeEach(() => clearLiveAvailability());

describe('parseLiveAvailability', () => {
	it('reads the counts and drops ones that are not positive numbers', () => {
		const live = parseLiveAvailability({
			fetchedAt: FETCHED_AT,
			counts: { '2102': 9, '2256': 0, '2286': '4', '2300': 1 }
		});
		expect(live?.fetchedAt.toISOString()).toBe(FETCHED_AT);
		expect([...live!.counts]).toEqual([
			['2102', 9],
			['2300', 1]
		]);
	});

	it('rejects anything else', () => {
		expect(parseLiveAvailability(null)).toBeNull();
		expect(parseLiveAvailability({ error: 'upstream' })).toBeNull();
		expect(parseLiveAvailability({ fetchedAt: 'not a date', counts: {} })).toBeNull();
		expect(parseLiveAvailability({ fetchedAt: FETCHED_AT })).toBeNull();
	});
});

describe('loadLiveAvailability', () => {
	it('asks the Worker once for a product and reuses the answer', async () => {
		const { calls, fetchFn } = worker(200, { fetchedAt: FETCHED_AT, counts: { '2102': 9 } });
		const [first, second] = await Promise.all([
			loadLiveAvailability('100151', fetchFn),
			loadLiveAvailability('100151', fetchFn)
		]);
		expect(first?.counts.get('2102')).toBe(9);
		expect(second).toBe(first);
		expect(await loadLiveAvailability('100151', fetchFn)).toBe(first);
		expect(calls).toEqual(['https://api.alkometriikka.fi/availability/100151']);
	});

	it('resolves to null on a failure and asks again next time', async () => {
		const failing = worker(429, { error: 'rate_limited' });
		expect(await loadLiveAvailability('100151', failing.fetchFn)).toBeNull();
		const offline = (async () => {
			throw new TypeError('Failed to fetch');
		}) as unknown as typeof fetch;
		expect(await loadLiveAvailability('100151', offline)).toBeNull();
		const working = worker(200, { fetchedAt: FETCHED_AT, counts: {} });
		expect((await loadLiveAvailability('100151', working.fetchFn))?.counts.size).toBe(0);
		expect(failing.calls).toHaveLength(1);
	});
});

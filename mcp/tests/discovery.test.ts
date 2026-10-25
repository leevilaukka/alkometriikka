import { afterAll, afterEach, beforeAll, describe, expect, it, setSystemTime } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ToolInputError } from '../catalog.ts';
import { StockSource } from '../stock.ts';
import { fixtureCatalog } from './helpers.ts';

const catalog = fixtureCatalog();

afterEach(() => setSystemTime());

describe('priceChanges', () => {
	const options = { days: 365, direction: 'all' as const, sort_by: 'date' as const, limit: 20 };

	it('lists the latest change per active product in the window', () => {
		setSystemTime(new Date('2026-09-20T12:00:00Z'));
		const result = catalog.priceChanges(options);
		expect(result.changes.map((change) => change.id)).toEqual(['200002', '100001']);
		const lager = result.changes[0]!;
		expect(lager).toMatchObject({ previous_price_eur: 2.99, new_price_eur: 2.5 });
		expect(lager.change_percent).toBeCloseTo(-16.4, 1);
		expect(result.price_drops).toBe(1);
		expect(result.price_rises).toBe(1);
	});

	it('filters by direction and window', () => {
		setSystemTime(new Date('2026-09-20T12:00:00Z'));
		expect(catalog.priceChanges({ ...options, direction: 'up' }).changes.map((c) => c.id)).toEqual([
			'100001'
		]);
		expect(catalog.priceChanges({ ...options, days: 30 }).changes.map((c) => c.id)).toEqual([
			'200002'
		]);
	});

	it('limits to a category and rejects unknown ones', () => {
		setSystemTime(new Date('2026-09-20T12:00:00Z'));
		expect(catalog.priceChanges({ ...options, category: 'Panimotuotteet' }).changes).toHaveLength(
			1
		);
		expect(() => catalog.priceChanges({ ...options, category: 'Kalsarit' })).toThrow(
			ToolInputError
		);
	});
});

describe('similarProducts', () => {
	it('excludes the product itself and removed products', () => {
		const result = catalog.similarProducts('300003', { limit: 10 });
		const ids = result.similar.map((product) => product.id);
		expect(ids).not.toContain('300003');
		expect(ids).not.toContain('500005');
		expect(ids.length).toBeGreaterThan(0);
	});

	it('applies the price cap', () => {
		const result = catalog.similarProducts('300003', { limit: 10, max_price: 5 });
		expect(result.similar.every((product) => (product.price_eur ?? 0) <= 5)).toBe(true);
	});
});

describe('cheaperAlternative', () => {
	it('reports no alternative when nothing comparable is cheaper', () => {
		const result = catalog.cheaperAlternative('200002', { quantity: 24 });
		expect(result.current_cost_eur).toBe(60);
		expect(result.alternative).toBeNull();
	});

	it('rejects unknown stores and products', () => {
		expect(() => catalog.cheaperAlternative('200002', { quantity: 1, store: 'Atlantis' })).toThrow(
			ToolInputError
		);
		expect(() => catalog.cheaperAlternative('999999', { quantity: 1 })).toThrow(ToolInputError);
	});
});

describe('storeOverview', () => {
	it('summarizes one store without a stock history', async () => {
		const result = await catalog.storeOverview('2101', 5);
		expect(result.store).toMatchObject({ store_id: '2101', name: 'Helsinki keskusta Testi' });
		// 100001 and 200002 are active there; 500005 is removed
		expect(result.product_count).toBe(2);
		expect(result.recent_arrivals).toBeNull();
		expect(result.best_value_by_category.length).toBeGreaterThan(0);
	});

	it('asks for a single store when the input matches several', async () => {
		await expect(catalog.storeOverview('Tampere', 5)).rejects.toThrow(/matches 2 stores/);
	});
});

describe('stock history', () => {
	let dir: string;
	beforeAll(() => {
		dir = mkdtempSync(join(tmpdir(), 'mcp-stock-'));
		mkdirSync(join(dir, 'stock', 'products'), { recursive: true });
		mkdirSync(join(dir, 'stock', 'stores'), { recursive: true });
		writeFileSync(
			join(dir, 'stock', 'products', '01.json'),
			JSON.stringify({ start: '2026-09-10', counts: { '100001': [5, 6, null, 8, 9, 10] } })
		);
		writeFileSync(
			join(dir, 'stock', 'stores', '2101.json'),
			JSON.stringify({ since: '2026-09-01', arrivals: [['200002', '2026-09-18']] })
		);
	});
	afterAll(() => rmSync(dir, { recursive: true, force: true }));

	const withStock = () => {
		const withHistory = fixtureCatalog();
		withHistory.stock = new StockSource({
			baseUrl: 'https://example.test',
			cacheDir: dir,
			localDir: dir,
			ttlMs: 1000,
			retryAfterFailureMs: 1000,
			timeoutMs: 1000,
			userAgent: 'test'
		});
		return withHistory;
	};

	it('reports the store count trend', async () => {
		const result = await withStock().stockTrend('100001', 30);
		expect(result.history_available).toBe(true);
		expect(result.trend).toMatchObject({ store_count_now: 10, store_count_before: 5, change: 5 });
		expect(result.history).toHaveLength(5);
	});

	it('says so when there is no history', async () => {
		const result = await catalog.stockTrend('100001', 30);
		expect(result.history_available).toBe(false);
		expect(result.trend).toBeNull();
	});

	it('lists recent arrivals in a store', async () => {
		const result = await withStock().storeOverview('2101', 5);
		expect(result.recent_arrivals).toEqual([
			expect.objectContaining({ id: '200002', arrived: '2026-09-18' })
		]);
	});

	it('remembers a missing file instead of retrying', async () => {
		let calls = 0;
		const source = new StockSource({
			baseUrl: 'https://example.test',
			cacheDir: dir,
			ttlMs: 1000,
			retryAfterFailureMs: 1000,
			timeoutMs: 1000,
			userAgent: 'test',
			fetch: async () => {
				calls++;
				return new Response('', { status: 404 });
			}
		});
		expect(await source.productShard('100001')).toBeNull();
		expect(await source.productShard('100001')).toBeNull();
		expect(calls).toBe(1);
	});
});

describe('suggestPunch', () => {
	it('fails clearly for an unknown template', () => {
		expect(() =>
			catalog.suggestPunch({ template: 'nope', people: 10, glasses_per_person: 3 })
		).toThrow(/Unknown template/);
	});

	it('fails when the catalog has no matching Alko products', () => {
		expect(() =>
			catalog.suggestPunch({ template: 'kuohuviini', people: 10, glasses_per_person: 3 })
		).toThrow(ToolInputError);
	});
});

describe('food pairing filter', () => {
	it('is accepted by search and the filter list', () => {
		expect(() => catalog.search({ food_pairings: ['Nauta'] })).toThrow(ToolInputError);
		expect(catalog.filterValues('food_pairing', undefined, 10).field).toBe('food_pairing');
	});
});

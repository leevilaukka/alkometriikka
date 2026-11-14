import { describe, expect, it } from 'bun:test';
import { ToolInputError } from '../catalog.ts';
import { LiveApi } from '../live.ts';
import { fixtureCatalog } from './helpers.ts';

type Route = (path: string) => Response | Promise<Response>;

const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});

/** A LiveApi whose Worker answers with `route`, recording the paths asked */
function fakeApi(route: Route, clock = { now: 0 }) {
	const calls: string[] = [];
	const api = new LiveApi({
		apiUrl: 'https://api.example.test/',
		userAgent: 'test',
		timeoutMs: 1000,
		now: () => clock.now,
		fetch: async (input) => {
			const path = new URL(input).pathname;
			calls.push(path);
			return route(path);
		}
	});
	return { api, calls, clock };
}

function catalogWith(route: Route) {
	const catalog = fixtureCatalog();
	catalog.live = fakeApi(route).api;
	return catalog;
}

const FETCHED_AT = '2026-11-14T10:00:00.000Z';
const UNKNOWN_EAN = '6415600549998';

describe('LiveApi', () => {
	it('reads barcode answers and remembers them', async () => {
		const { api, calls } = fakeApi((path) =>
			path.endsWith(UNKNOWN_EAN) ? json({ id: '200002' }) : json({ error: 'not_found' }, 404)
		);
		expect(await api.gtin(UNKNOWN_EAN)).toBe('200002');
		expect(await api.gtin(UNKNOWN_EAN)).toBe('200002');
		expect(await api.gtin('6412345678907')).toBe('not_found');
		expect(calls).toEqual([`/gtin/${UNKNOWN_EAN}`, '/gtin/6412345678907']);
	});

	it('does not ask about invalid barcodes', async () => {
		const { api, calls } = fakeApi(() => json({ id: '200002' }));
		expect(await api.gtin('6412345678901')).toBe('not_found');
		expect(calls).toEqual([]);
	});

	it('keeps failures for a minute only', async () => {
		let up = false;
		const { api, calls, clock } = fakeApi(() =>
			up ? json({ fetchedAt: FETCHED_AT, counts: { '2101': 3 } }) : json({}, 502)
		);
		expect(await api.availability('100001')).toBeNull();
		up = true;
		clock.now = 30_000;
		expect(await api.availability('100001')).toBeNull();
		clock.now = 61_000;
		expect((await api.availability('100001'))?.counts.get('2101')).toBe(3);
		expect(calls).toHaveLength(2);
	});

	it('shares concurrent requests and survives network errors', async () => {
		const { api, calls } = fakeApi(() => {
			throw new Error('offline');
		});
		const [a, b] = await Promise.all([api.availability('1'), api.availability('1')]);
		expect([a, b]).toEqual([null, null]);
		expect(calls).toHaveLength(1);
	});
});

describe('barcodes', () => {
	const catalog = fixtureCatalog();

	it('accepts a known barcode wherever a product ID goes', () => {
		expect(catalog.getProduct('6412345678907').product.id).toBe('100001');
		// UPC-A is stored padded to EAN-13
		expect(catalog.getProduct('036000291452').product.id).toBe('500005');
	});

	it('points unknown barcodes to lookup_barcode', () => {
		expect(() => catalog.getProduct(UNKNOWN_EAN)).toThrow(/lookup_barcode/);
	});

	it('finds a barcode in the catalog without asking Alko', async () => {
		const result = await catalogWith(() => {
			throw new Error('should not be asked');
		}).lookupBarcode('6412345678907');
		expect(result).toMatchObject({
			found: true,
			source: 'catalog',
			product: { id: '100001', ean: '6412345678907' }
		});
	});

	it('asks Alko about barcodes the catalog does not know', async () => {
		const result = await catalogWith(() => json({ id: '200002' })).lookupBarcode(UNKNOWN_EAN);
		expect(result).toMatchObject({ found: true, source: 'alko', product: { id: '200002' } });
	});

	it('reports a product Alko knows but the catalog does not have yet', async () => {
		const result = await catalogWith(() => json({ id: '987654' })).lookupBarcode(UNKNOWN_EAN);
		expect(result).toMatchObject({ found: false, alko_product_id: '987654', lookup_failed: false });
		expect(result.note).toContain('next sync');
	});

	it('asks Alko about a barcode only on a removed product, and falls back to it', async () => {
		const moved = await catalogWith(() => json({ id: '300003' })).lookupBarcode('036000291452');
		expect(moved).toMatchObject({ source: 'alko', product: { id: '300003' } });
		const gone = await catalogWith(() => json({}, 404)).lookupBarcode('036000291452');
		expect(gone).toMatchObject({
			source: 'catalog',
			product: { id: '500005', removed_from_selection: true }
		});
	});

	it('tells not found apart from a failed lookup', async () => {
		const missing = await catalogWith(() => json({}, 404)).lookupBarcode(UNKNOWN_EAN);
		expect(missing).toMatchObject({ found: false, lookup_failed: false });
		const failed = await catalogWith(() => json({}, 503)).lookupBarcode(UNKNOWN_EAN);
		expect(failed).toMatchObject({ found: false, lookup_failed: true });
		const off = await fixtureCatalog().lookupBarcode(UNKNOWN_EAN);
		expect(off).toMatchObject({ found: false, lookup_failed: false });
		expect(off.note).toContain('turned off');
	});

	it('rejects codes that are not barcodes', async () => {
		await expect(fixtureCatalog().lookupBarcode('6412345678901')).rejects.toBeInstanceOf(
			ToolInputError
		);
		await expect(fixtureCatalog().lookupBarcode('abc')).rejects.toBeInstanceOf(ToolInputError);
	});
});

describe('live store counts', () => {
	it('lists the stores the live counts name, with units', async () => {
		const catalog = catalogWith(() =>
			json({ fetchedAt: FETCHED_AT, counts: { '2202': 7, '2301': 2, '0000': 5 } })
		);
		const result = await catalog.storeAvailability('100001', { limit: 25 });
		expect(result.live).toEqual({ available: true, fetched_at: FETCHED_AT, total_units: 9 });
		expect(result.stores.map(({ store_id, units }) => [store_id, units])).toEqual([
			['2202', 7],
			['2301', 2]
		]);
		expect(result.limitations[0]).toContain('units');
	});

	it('falls back to the snapshot when the counts cannot be fetched', async () => {
		const result = await catalogWith(() => json({}, 502)).storeAvailability('100001', {
			limit: 25
		});
		expect(result.live).toEqual({ available: false, fetched_at: null, total_units: null });
		expect(result.stores.map((store) => [store.store_id, store.units])).toEqual([
			['2101', null],
			['2201', null]
		]);
		expect(result.limitations[0]).toContain('could not be fetched');
	});
});

describe('status', () => {
	it('reports Alko’s status, including products that never went on sale', () => {
		const catalog = fixtureCatalog();
		expect(catalog.getProduct('300003').product.status).toBe('Poistuva');
		expect(catalog.getProduct('400004').product.status).toBe('Ei myynnissä');
		expect(catalog.getProduct('500005').product.status).toBeNull();
	});
});

import { describe, expect, it } from 'bun:test';
import { stockFiles, updateStockState, type StockState } from '../../scripts/data/stock';
import {
	STOCK_HISTORY_DAYS,
	addDays,
	parseProductStockShard,
	parseStoreStockFile,
	productStockSeries,
	stockShard,
	stockTrend
} from '$lib/utils/catalog/stock';

const stores = { A: { id: 'A' }, B: { id: 'B' } };
const availability = (product: Record<string, string[]>, storeList = stores) => ({
	stores: storeList,
	product
});

/** Runs the history through consecutive days, one availability per day, starting a warm-up ago. */
function history(days: Record<string, string[]>[], start = '2026-10-01'): StockState {
	let state: StockState | null = null;
	let previous: ReturnType<typeof availability> | null = null;
	days.forEach((product, offset) => {
		const current = availability(product);
		state = updateStockState(state, previous, current, addDays(start, offset));
		previous = current;
	});
	return state!;
}

describe('stock counts', () => {
	it('counts known stores per product per day', () => {
		const state = history([{ '100': ['A', 'B', 'pickup'] }, { '100': ['A'], '200': ['B'] }]);
		expect(state.start).toBe('2026-10-01');
		expect(state.counts['100']).toEqual([2, 1]);
		expect(state.counts['200']).toEqual([null, 1]);
	});

	it('leaves days without a run empty and overwrites a rerun on the same day', () => {
		let state = updateStockState(null, null, availability({ '100': ['A'] }), '2026-10-01');
		state = updateStockState(state, null, availability({ '100': ['A', 'B'] }), '2026-10-03');
		state = updateStockState(state, null, availability({ '100': ['B'] }), '2026-10-03');
		expect(state.counts['100']).toEqual([1, null, 1]);
	});

	it('marks a product that left the selection', () => {
		const state = history([{ '100': ['A'] }, {}]);
		expect(state.counts['100']).toEqual([1, null]);
	});

	it(`keeps ${STOCK_HISTORY_DAYS} days and forgets products with nothing left in them`, () => {
		let state = updateStockState(null, null, availability({ '100': ['A'] }), '2026-01-01');
		state = updateStockState(state, null, availability({ '200': ['A'] }), '2026-06-01');
		expect(state.start).toBe(addDays('2026-06-01', -(STOCK_HISTORY_DAYS - 1)));
		expect(state.counts['200']).toHaveLength(STOCK_HISTORY_DAYS);
		expect(state.counts['100']).toBeUndefined();
	});
});

describe('store arrivals', () => {
	const warmUp = Array.from({ length: 14 }, () => ({ '100': ['A'] }));

	it('records products new to a store once the warm-up has passed', () => {
		const early = history([{ '100': ['A'] }, { '100': ['A'], '200': ['A'] }]);
		expect(early.arrivals.A).toEqual({});

		const state = history([...warmUp, { '100': ['A'], '200': ['A'] }]);
		expect(state.arrivals.A).toEqual({ '200': addDays('2026-10-01', 14) });
	});

	it('treats a short absence as a restock, a long one as an arrival', () => {
		const shortGap = history([
			...warmUp,
			{ '100': ['A'], '200': ['A'] },
			{ '100': ['A'] },
			{ '100': ['A'], '200': ['A'] }
		]);
		// Only the first appearance counts
		expect(shortGap.arrivals.A['200']).toBe(addDays('2026-10-01', 14));

		const away = Array.from({ length: 14 }, () => ({ '100': ['A'] }));
		const longGap = history([...warmUp, { '200': ['A'] }, ...away, { '200': ['A'] }]);
		expect(longGap.arrivals.A['200']).toBe(addDays('2026-10-01', 29));
	});

	it('skips stores that are new to the list and drops closed ones', () => {
		let state = history([...warmUp]);
		const withC = { ...stores, C: { id: 'C' } };
		state = updateStockState(
			state,
			availability({ '100': ['A'] }),
			availability({ '100': ['A', 'C'] }, withC),
			'2026-10-20'
		);
		expect(state.arrivals.C).toBeUndefined();

		state = updateStockState(
			state,
			availability({ '100': ['A', 'C'] }, withC),
			availability({ '100': ['A'] }, { A: { id: 'A' } } as typeof stores),
			'2026-10-21'
		);
		expect(Object.keys(state.arrivals)).toEqual(['A']);
	});

	it('detects nothing without the previous availability', () => {
		const state = updateStockState(
			history(warmUp),
			null,
			availability({ '100': ['A'], '200': ['A'] }),
			'2026-10-20'
		);
		expect(state.arrivals.A).toEqual({});
	});
});

describe('stock files', () => {
	it('shards products and lists still stocked arrivals newest first', () => {
		const warmUp = Array.from({ length: 14 }, () => ({ '100': ['A'] }));
		const state = history([
			...warmUp,
			{ '100': ['A'], '201': ['A'] },
			{ '100': ['A'], '201': ['A'], '300': ['A'], '400': ['A'] },
			{ '100': ['A'], '201': ['A'], '300': ['A'] }
		]);
		const last = availability({ '100': ['A'], '201': ['A'], '300': ['A'] });
		const files = stockFiles(state, last);

		expect([...files.products.keys()].sort()).toEqual(['00', '01']);
		expect(files.products.get('01')!.counts['201']).toHaveLength(17);
		expect(files.stores.get('A')!.arrivals).toEqual([
			['300', addDays('2026-10-01', 15)],
			['201', addDays('2026-10-01', 14)]
		]);
		expect(files.stores.get('B')!.arrivals).toEqual([]);
	});
});

describe('stock client helpers', () => {
	it('reads a product series and its trend', () => {
		const shard = parseProductStockShard({
			start: '2026-09-01',
			counts: { '906458': [10, null, 12, 8], bad: ['x'] }
		})!;
		expect(shard.counts.bad).toBeUndefined();
		const series = productStockSeries(shard, '906458');
		expect(series).toEqual([
			{ date: '2026-09-01', count: 10 },
			{ date: '2026-09-03', count: 12 },
			{ date: '2026-09-04', count: 8 }
		]);
		expect(stockTrend(series, 2)).toEqual({
			now: { date: '2026-09-04', count: 8 },
			before: { date: '2026-09-03', count: 12 },
			change: -4
		});
		expect(stockTrend(series.slice(0, 1))).toBeNull();
	});

	it('shards by the last two digits', () => {
		expect(stockShard('906458')).toBe('58');
		expect(stockShard('7')).toBe('07');
	});

	it('drops malformed store files and entries', () => {
		expect(parseStoreStockFile({ arrivals: [] })).toBeNull();
		expect(
			parseStoreStockFile({ since: '2026-10-01', arrivals: [['1', '2026-10-02'], ['2']] })
		).toEqual({ since: '2026-10-01', arrivals: [['1', '2026-10-02']] });
	});
});

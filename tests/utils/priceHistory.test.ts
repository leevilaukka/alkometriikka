import { describe, expect, it } from 'bun:test';
import {
	hasRecordedPriceChange,
	historyTimestamp,
	priceHistoryChartPoints
} from '$lib/utils/catalog/priceHistory';
import type { PriceHistoryEntry } from '$lib/types';

function archive(date: string, end = date, price = 10): PriceHistoryEntry {
	return {
		date,
		price,
		archive: { sourceId: 'test', lastObserved: end, lastSourceId: 'test', observations: 1 }
	};
}

describe('dated historical observations', () => {
	it('extends an unchanged live price to the last sync, including a short selected range', () => {
		const entry = { date: '2026-08-01', price: 10 };
		const points = priceHistoryChartPoints([entry], '2026-10-01', '2026-10-21');
		expect(points.map((point) => point!.x)).toEqual(
			['2026-10-01', '2026-10-21'].map(historyTimestamp)
		);
		expect(points.map((point) => point!.y)).toEqual([10, 10]);
		expect(priceHistoryChartPoints([entry], '2026-11-01', '2026-10-21')).toEqual([]);
	});
	it('never extends an archive price through the last sync', () => {
		const points = priceHistoryChartPoints([archive('2025-01-01')], undefined, '2026-10-21');
		expect(points).toHaveLength(1);
		expect(points[0]!.x).toBe(historyTimestamp('2025-01-01'));
	});
	it('advertises a price-change feed only when two live observations differ', () => {
		const history = [archive('2007-05-11', '2007-05-11', 5), { date: '2026-10-01', price: 10 }];
		expect(hasRecordedPriceChange(history)).toBe(false);
		expect(hasRecordedPriceChange([...history, { date: '2026-10-21', price: 12 }])).toBe(true);
	});
	it('uses elapsed time and breaks the line between isolated archive observations', () => {
		const points = priceHistoryChartPoints([archive('2007-05-11'), archive('2025-09-11')]);
		expect(points).toHaveLength(3);
		expect(points[1]).toBeNull();
		expect(points[2]!.x - points[0]!.x).toBe(
			historyTimestamp('2025-09-11') - historyTimestamp('2007-05-11')
		);
	});
	it('retains the last actual observation of a compacted daily run', () => {
		const points = priceHistoryChartPoints([
			archive('2025-09-11', '2025-09-29'),
			archive('2025-09-30', '2025-09-30', 9)
		]);
		expect(points.filter(Boolean).map((point) => point!.x)).toEqual(
			['2025-09-11', '2025-09-29', '2025-09-30'].map(historyTimestamp)
		);
		expect(points).not.toContain(null);
	});
	it('does not carry an old archive price into a range with no observations', () => {
		expect(priceHistoryChartPoints([archive('2016-08-05')], '2026-09-01')).toEqual([]);
	});
	it('retains gaps inside a compacted equal-price run', () => {
		const entry = archive('2007-05-11', '2016-08-05');
		entry.archive!.ranges = [
			['2007-05-11', '2007-05-11'],
			['2016-08-05', '2016-08-05']
		];
		expect(priceHistoryChartPoints([entry])[1]).toBeNull();
		const clipped = priceHistoryChartPoints([entry], '2015-01-01');
		expect(clipped).toHaveLength(1);
		expect(clipped[0]!.x).toBe(historyTimestamp('2016-08-05'));
	});
	it('keeps live range baselines and campaign metadata', () => {
		const point = { date: '2026-08-01', price: 8, normalPrice: 10, campaignStart: '2026-08-01' };
		const points = priceHistoryChartPoints([point], '2026-09-01');
		expect(points[0]!.x).toBe(historyTimestamp('2026-09-01'));
		expect(points[0]!.entry).toEqual(point);
	});
	it('breaks the long gap after the recovered archive ends', () => {
		const points = priceHistoryChartPoints([
			archive('2026-02-01'),
			{ date: '2026-02-02', price: 10 },
			{ date: '2026-07-18', price: 12 }
		]);
		expect(points[2]).toBeNull();
	});
});

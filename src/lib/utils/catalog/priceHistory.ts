import type { PriceHistoryEntry } from '../../types';

export const HISTORY_DAY = 24 * 60 * 60 * 1000;

export function historyTimestamp(date: string): number {
	return Date.parse(`${date}T00:00:00Z`);
}

export function formatHistoryDate(date: string | number): string {
	return new Date(typeof date === 'number' ? date : historyTimestamp(date)).toLocaleDateString(
		'fi-FI',
		{ timeZone: 'UTC' }
	);
}

export type HistoryChartPoint = {
	x: number;
	y: number;
	entry: PriceHistoryEntry;
	/** Endpoint of a compacted run, or a live price carried into the selected range. */
	boundary?: boolean;
};

/** Actual dates on the x axis; nulls break lines across unobserved archive periods. */
export function priceHistoryChartPoints(
	history: PriceHistoryEntry[],
	cutoff?: string
): (HistoryChartPoint | null)[] {
	const sorted = history
		.filter(
			(point) => Number.isFinite(historyTimestamp(point.date)) && Number.isFinite(point.price)
		)
		.toSorted((a, b) => a.date.localeCompare(b.date));
	const cutoffTime = cutoff ? historyTimestamp(cutoff) : -Infinity;
	const lastArchiveEnd = Math.max(
		-Infinity,
		...sorted
			.filter((point) => point.archive)
			.map((point) => historyTimestamp(point.archive!.lastObserved))
	);
	const expanded: HistoryChartPoint[] = [];
	for (const entry of sorted) {
		const ranges = entry.archive?.ranges ?? [
			[entry.date, entry.archive?.lastObserved ?? entry.date]
		];
		for (const [start, end] of ranges) {
			expanded.push({
				x: historyTimestamp(start),
				y: entry.price,
				entry,
				boundary: start !== entry.date
			});
			if (end > start)
				expanded.push({ x: historyTimestamp(end), y: entry.price, entry, boundary: true });
		}
	}
	const visible = expanded.filter((point) => point.x >= cutoffTime);
	const previous = expanded.findLast((point) => point.x < cutoffTime);
	// Never extend a historical observation past the last date that witnessed it.
	if (previous && !previous.entry.archive && visible[0]?.x !== cutoffTime) {
		visible.unshift({ ...previous, x: cutoffTime, boundary: true });
	} else if (
		previous?.entry.archive &&
		(
			previous.entry.archive.ranges ?? [[previous.entry.date, previous.entry.archive.lastObserved]]
		).some(
			([start, end]) => historyTimestamp(start) <= cutoffTime && historyTimestamp(end) >= cutoffTime
		) &&
		visible[0]?.x !== cutoffTime
	) {
		visible.unshift({ ...previous, x: cutoffTime, boundary: true });
	}
	const result: (HistoryChartPoint | null)[] = [];
	for (const point of visible) {
		const before = result.findLast((value): value is HistoryChartPoint => value !== null);
		if (before) {
			const days = (point.x - before.x) / HISTORY_DAY;
			const hasArchiveEvidence = before.entry.archive || point.entry.archive;
			const sameObservedRange =
				before.entry === point.entry &&
				before.entry.archive &&
				(
					before.entry.archive.ranges ?? [[before.entry.date, before.entry.archive.lastObserved]]
				).some(
					([start, end]) => historyTimestamp(start) <= before.x && historyTimestamp(end) >= point.x
				);
			// In the preview an archive ending next to the last live point cannot
			// establish continuity across the following multi-month hiatus either.
			const archiveHandoverGap = before.x <= lastArchiveEnd + HISTORY_DAY && days > 45;
			if (days > 1 && !sameObservedRange && (hasArchiveEvidence || archiveHandoverGap))
				result.push(null);
		}
		result.push(point);
	}
	return result;
}

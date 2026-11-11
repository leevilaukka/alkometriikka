import { AllColumns } from '../constants/columns';
import type { ColumnNames, PriceListItem } from '../../types';

/** A single histogram bin, labelled with the bucket's lower / upper bound. */
export type HistogramBin = {
	label: string;
	from: number;
	to: number;
	count: number;
	/** True when the bin absorbs every value above `to` (clamped histograms). */
	isTail?: boolean;
};

/** Top entries of a categorical breakdown, with the long tail collapsed. */
export type CategoryDistribution = {
	key: string;
	count: number;
}[];

export type StatsSummary = {
	total: number;
	avgPrice: number | null;
	avgPricePerLiter: number | null;
	avgAlcoholPercentage: number | null;
};

/** Products that are still part of the current selection. */
function activeProducts(items: PriceListItem[]) {
	const removed = AllColumns.RemovedFromSelection as keyof PriceListItem;
	return items.filter((item) => !item[removed]);
}

/** Products that are still in the selection with a matching category column. */
function withCategory(items: PriceListItem[], key: ColumnNames) {
	return activeProducts(items).filter((item) => {
		const value = item[key];
		return typeof value === 'string' && value.trim().length > 0;
	});
}

/**
 * Counts products into fixed, labelled bands (e.g. "5–10 €", "yli 1 000 €").
 * The final band absorbs everything above the last edge. Pair with a
 * logarithmic y-axis so a few extreme products don't flatten the bars.
 */
export function bandHistogram(
	items: PriceListItem[],
	key: ColumnNames,
	edges: number[],
	unit: string
): HistogramBin[] {
	const values = items
		.map((item) => Number(item[key]))
		.filter((value) => Number.isFinite(value) && value >= 0);

	if (values.length === 0 || edges.length < 2) return [];

	const num = (value: number) => formatFinNumber(value, 1).replace(/,0$/, '');
	const upper = edges[edges.length - 1];
	return edges.slice(0, -1).map((from, i) => {
		const to = edges[i + 1];
		const isTail = i === edges.length - 2;
		const count = values.filter(
			(value) => value >= from && (isTail ? value <= upper : value < to)
		).length;
		return {
			label:
				i === 0
					? `alle ${num(to)} ${unit}`
					: isTail
						? `yli ${num(from)} ${unit}`
						: `${num(from)}–${num(to)} ${unit}`,
			from,
			to,
			count,
			isTail
		};
	});
}

/** Aggregates products by a categorical column, sorted by count descending. */
export function categoryDistribution(
	items: PriceListItem[],
	key: ColumnNames,
	{ excludeCount = 0 }: { excludeCount?: number } = {}
): CategoryDistribution {
	const counts = new Map<string, number>();
	for (const item of withCategory(items, key)) {
		const value = String(item[key]);
		counts.set(value, (counts.get(value) ?? 0) + 1);
	}
	return [...counts.entries()]
		.map(([key, count]) => ({ key, count }))
		.sort((a, b) => b.count - a.count || a.key.localeCompare(b.key, 'fi'))
		.slice(Math.max(0, excludeCount));
}

/** Truncates a distribution to `maxEntries`, collapsing the rest into "Muu". */
export function topCategories(
	distribution: CategoryDistribution,
	maxEntries: number,
	{ otherLabel = 'Muu' }: { otherLabel?: string } = {}
): CategoryDistribution {
	if (distribution.length <= maxEntries) return distribution;
	const top = distribution.slice(0, maxEntries);
	const tailCount = distribution.slice(maxEntries).reduce((sum, entry) => sum + entry.count, 0);
	top.push({ key: otherLabel, count: tailCount });
	return top;
}

/** Aggregates products by their real subcategory (e.g. "punaviinit").
 * Products that only carry a taste descriptor (Alko stores styles like
 * "Pirteä & hedelmäinen" in the subcategory column) are grouped under
 * "Makuominaisuus". */
export function subcategoryDistribution(items: PriceListItem[]): CategoryDistribution {
	const counts = new Map<string, number>();
	for (const item of withCategory(items, AllColumns.Type)) {
		const sub = (item[AllColumns.SubType] as string | undefined)?.trim() ?? '';
		if (sub.length === 0 || sub === 'Ei määritelty') continue;
		const key = sub.includes('&') || sub.includes('–') ? 'Makuominaisuus' : sub;
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}
	return [...counts.entries()]
		.map(([key, count]) => ({ key, count }))
		.sort((a, b) => b.count - a.count || a.key.localeCompare(b.key, 'fi'));
}

/** Computes the overall summary statistics (averages over active products). */
export function computeSummary(items: PriceListItem[]): StatsSummary {
	const products = activeProducts(items);
	const average = (key: ColumnNames) => {
		const values = products
			.map((item) => Number(item[key]))
			.filter((value) => Number.isFinite(value) && value > 0);
		if (values.length === 0) return null;
		return values.reduce((sum, value) => sum + value, 0) / values.length;
	};
	return {
		total: products.length,
		avgPrice: average(AllColumns.Price),
		avgPricePerLiter: average(AllColumns.PricePerLiter),
		avgAlcoholPercentage: average(AllColumns.AlcoholPercentage)
	};
}

/** A product compared by price-per-alcohol value. */
export type ValueRank = {
	number: string;
	name: string;
	gramsPerEuro: number;
	price: number;
	alcoholGrams: number;
	alcoholPercentage: number;
	removed: boolean;
};

/** Ranks products by alcohol grams per euro (best value first). */
export function bestValueRanks(items: PriceListItem[], limit = 50): ValueRank[] {
	const gramsPerEuro = (item: PriceListItem) => Number(item[AllColumns.AlcoholGramsPerEuro]);

	return items
		.filter(
			(item) =>
				Number.isFinite(gramsPerEuro(item)) && Number.isFinite(Number(item[AllColumns.Price]))
		)
		.map((item) => ({
			number: String(item[AllColumns.Number]),
			name: String(item[AllColumns.Name]),
			gramsPerEuro: gramsPerEuro(item),
			price: Number(item[AllColumns.Price]),
			alcoholGrams: Number(item[AllColumns.AlcoholGrams]),
			alcoholPercentage: Number(item[AllColumns.AlcoholPercentage]),
			removed: Boolean(item[AllColumns.RemovedFromSelection])
		}))
		.sort((a, b) => b.gramsPerEuro - a.gramsPerEuro)
		.slice(0, limit);
}

/** Formats a number with Finnish (dot-to-comma) decimal separators. */
export function formatFinNumber(value: number, maximumFractionDigits = 2): string {
	return value.toLocaleString('fi-FI', {
		maximumFractionDigits,
		useGrouping: false
	});
}

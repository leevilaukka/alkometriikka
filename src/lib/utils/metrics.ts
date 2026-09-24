import type { Kaljakori } from '$lib/alko';
import type { ColumnNames, PriceListItem } from '$lib/types';
import { AllColumns, DatasetColumns, DrunkColumns, hideFromProductPageStats } from './constants';
import { formatValue } from './format';
import { headerToDisplayName, isNullish } from './helpers';

export type QualityMetric = {
	key: ColumnNames;
	label: string;
	value: string;
	percentile: number;
	barPercent: number;
	note: string;
};

export type QualityMetricsResult = {
	metrics: QualityMetric[];
	sampleSize: number;
	categoryLabel: string;
};

type MetricDefinition = {
	key: ColumnNames;
	label: string;
	higherIsBetter: boolean;
	note: (percentile: number) => string;
};

/**
 * Fixed set of "Hinta-laatu" metrics, all normalized so a higher percentile is
 * always better regardless of whether the underlying column itself is
 * better-when-lower (price) or better-when-higher (alcohol grams per euro).
 */
const metricDefinitions: MetricDefinition[] = [
	{
		key: AllColumns.PricePerLiter,
		label: 'Hintataso',
		higherIsBetter: false,
		note: (p) => `Halvempi litrahinta kuin ${p} % vastaavista tuotteista`
	},
	{
		key: AllColumns.AlcoholGramsPerEuro,
		label: 'Alkoholia rahalle',
		higherIsBetter: true,
		note: (p) => `Enemmän alkoholia/€ kuin ${p} %:lla vastaavista`
	},
	{
		key: AllColumns.Sugar,
		label: 'Sokeripitoisuus',
		higherIsBetter: false,
		note: (p) => `Vähemmän sokeria kuin ${p} %:lla vastaavista`
	},
	{
		key: AllColumns.PromillePerEuro,
		label: 'Promillet per euro',
		higherIsBetter: true,
		note: (p) => `Enemmän promilleja/€ kuin ${p} %:lla vastaavista`
	}
];

/**
 * Computes percentile-based "Hinta-laatu" metrics for `product` against other
 * products sharing the same `Tyyppi` (category). Returns an empty `metrics`
 * array when there are no comparable peers, so callers can hide the section.
 */
export function computeQualityMetrics(
	product: PriceListItem,
	kaljakori: Kaljakori
): QualityMetricsResult {
	const CATEGORY_COLUMN = AllColumns.SubType in product ? AllColumns.SubType : AllColumns.Type;

	const category = product[CATEGORY_COLUMN];
	const peers = kaljakori.data.filter(
		(item) =>
			item[CATEGORY_COLUMN] === category &&
			item[AllColumns.Number] !== product[AllColumns.Number]
	);
	const sampleSize = peers.length;

	if (sampleSize === 0) {
		return { metrics: [], sampleSize: 0, categoryLabel: category };
	}

	const metrics = metricDefinitions.map((def) => {
		const productValue = Number(product[def.key]) || 0;
		const worseOrEqualCount = peers.filter((item) => {
			const peerValue = Number(item[def.key]) || 0;
			return def.higherIsBetter ? peerValue <= productValue : peerValue >= productValue;
		}).length;
		const percentile = Math.round((worseOrEqualCount / sampleSize) * 100);

		return {
			key: def.key,
			label: def.label,
			value: String(formatValue(productValue, def.key)),
			percentile,
			barPercent: percentile,
			note: def.note(percentile)
		};
	});

	return { metrics, sampleSize, categoryLabel: category };
}

export type SimilarProductDelta = {
	product: PriceListItem;
	deltaPrice: number;
	deltaPricePercent: number;
	deltaGramsPerEuro: number;
	deltaGramsPerEuroPercent: number;
	isBestValue: boolean;
};

/**
 * Computes per-candidate price and alcohol-grams-per-euro deltas vs
 * `reference`, and flags the single best-value candidate (highest g/€) in
 * the passed set.
 */
export function computeSimilarProductDeltas(
	reference: PriceListItem,
	candidates: PriceListItem[]
): SimilarProductDelta[] {
	const refPrice = reference[AllColumns.Price];
	const refGpe = reference[AllColumns.AlcoholGramsPerEuro];
	let bestGpe = -Infinity;
	let bestIndex = -1;

	const deltas = candidates.map((product, index) => {
		const price = product[AllColumns.Price];
		const gpe = product[AllColumns.AlcoholGramsPerEuro];
		if (gpe > bestGpe) {
			bestGpe = gpe;
			bestIndex = index;
		}
		return {
			product,
			deltaPrice: price - refPrice,
			deltaPricePercent: refPrice ? ((price - refPrice) / refPrice) * 100 : 0,
			deltaGramsPerEuro: gpe - refGpe,
			deltaGramsPerEuroPercent: refGpe ? ((gpe - refGpe) / refGpe) * 100 : 0,
			isBestValue: false
		};
	});

	if (bestIndex >= 0) deltas[bestIndex].isBestValue = true;
	return deltas;
}

export type SimilarProductChip = {
	label: string;
	value: string | null;
	count: number;
};

/** Groups `candidates` by Alatyyppi (SubType) with counts, plus a leading "Kaikki" chip. */
export function groupSimilarProductsBySubType(candidates: PriceListItem[]): SimilarProductChip[] {
	const counts = new Map<string, number>();
	for (const product of candidates) {
		const subType = product[AllColumns.SubType] || 'Muut';
		counts.set(subType, (counts.get(subType) ?? 0) + 1);
	}
	const chips: SimilarProductChip[] = [{ label: 'Kaikki', value: null, count: candidates.length }];
	for (const [label, count] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
		chips.push({ label, value: label, count });
	}
	return chips;
}

/**
 * Direction that makes one product's value in a given column objectively
 * better than another's, used to highlight the winning cell(s) on the
 * product comparison page. Columns without an entry here are informational
 * or a matter of taste (e.g. country, colour, bitterness) and are never
 * highlighted, since there is no objectively "best" value for them.
 */
export const comparisonBestDirection: Partial<Record<ColumnNames, 'lower' | 'higher'>> = {
	[AllColumns.Price]: 'lower',
	[AllColumns.PricePerLiter]: 'lower',
	[AllColumns.NormalPrice]: 'lower',
	[AllColumns.AlcoholGramsPerEuro]: 'higher',
	[AllColumns.PromillePerEuro]: 'higher',
	[AllColumns.EuroPerLiterAlcohol]: 'lower',
	[AllColumns.Sugar]: 'lower',
	[AllColumns.Servings]: 'higher',
	[AllColumns.Energy]: 'lower'
};

/**
 * Returns the product numbers holding the objectively best value of `key`
 * among `products` (ties included), or an empty set when `key` has no
 * defined {@link comparisonBestDirection} or fewer than two products have a
 * usable numeric value.
 */
export function getBestProductNumbers(products: PriceListItem[], key: ColumnNames): Set<string> {
	const direction = comparisonBestDirection[key];
	if (!direction) return new Set();

	const numericValues = products
		.map((product) => Number(product[key]))
		.filter((value) => Number.isFinite(value));

	if (numericValues.length < 2) return new Set();

	const target = direction === 'lower' ? Math.min(...numericValues) : Math.max(...numericValues);

	return new Set(
		products
			.filter((product) => Number(product[key]) === target)
			.map((product) => product[AllColumns.Number])
	);
}

export type ComparisonCell = {
	product: PriceListItem;
	value: string;
	isBest: boolean;
};

export type ComparisonRow = {
	key: ColumnNames;
	label: string;
	cells: ComparisonCell[];
};

function hasComparableValue(value: unknown): boolean {
	return (
		!isNullish(value) &&
		(!(value instanceof Set) || value.size > 0) &&
		(!Array.isArray(value) || value.length > 0) &&
		(typeof value !== 'string' || value.trim().length > 0)
	);
}

/**
 * Builds the full "Tuotetiedot" comparison table for `products`: one row per
 * dataset/drunk-value column that has a value on at least one product,
 * excluding the columns already shown prominently elsewhere on the
 * comparison page (@see hideFromProductPageStats). The best cell(s) of each
 * row are flagged using {@link getBestProductNumbers}.
 */
export function computeComparisonRows(products: PriceListItem[]): ComparisonRow[] {
	const columns = [...Object.values(DatasetColumns), ...Object.values(DrunkColumns)] as ColumnNames[];

	const rows: ComparisonRow[] = [];

	for (const key of columns) {
		if (hideFromProductPageStats.has(key)) continue;
		if (!products.some((product) => hasComparableValue(product[key]))) continue;

		const bestProductNumbers = getBestProductNumbers(products, key);

		rows.push({
			key,
			label: headerToDisplayName(key),
			cells: products.map((product) => ({
				product,
				value: String(formatValue(product[key] as string | number | boolean | Set<string>, key)),
				isBest: bestProductNumbers.has(product[AllColumns.Number])
			}))
		});
	}

	return rows;
}

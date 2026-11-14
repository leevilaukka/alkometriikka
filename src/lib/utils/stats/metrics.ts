import type { Kaljakori } from '$lib/alko';
import type { ColumnNames, PriceListItem } from '$lib/types';
import { categorySlug, findProductCategoryTrail } from '../catalog/categories';
import {
	AllColumns,
	DatasetColumns,
	DrunkColumns,
	hideFromProductPageStats,
	zeroWithoutAlcoholColumns
} from '../constants/columns';
import { formatRoundedPricePerLiter, formatValue } from '../format/format';
import { headerToDisplayName, isNullish } from '../format/labels';

/** Key of the alcohol-free products' price comparison with their alcoholic version. */
export const alcoholicPricePerLiterKey = 'alcoholicPricePerLiter';

export type QualityMetric = {
	key: ColumnNames | typeof alcoholicPricePerLiterKey;
	label: string;
	value: string;
	percentile: number;
	barPercent: number;
	note: string;
	/** A reference value shown after `value`, e.g. "vs. 33 €/L". */
	comparison?: string;
};

export type QualityMetricsResult = {
	metrics: QualityMetric[];
	sampleSize: number;
	categoryLabel: string;
	/** Median price per liter of the same peer group (product included) the percentiles use. */
	medianPricePerLiter: number | null;
};

type MetricDefinition = {
	key: ColumnNames;
	label: string;
	higherIsBetter: boolean;
	note: (percentile: number) => string;
};

const pricePerLiterMetric: MetricDefinition = {
	key: AllColumns.PricePerLiter,
	label: 'Hintataso',
	higherIsBetter: false,
	note: (p) => `Halvempi litrahinta kuin ${p} % vastaavista tuotteista`
};

const sugarMetric: MetricDefinition = {
	key: AllColumns.Sugar,
	label: 'Sokeripitoisuus',
	higherIsBetter: false,
	note: (p) => `Vähemmän sokeria kuin ${p} %:lla vastaavista`
};

/**
 * Fixed set of "Hinta-laatu" metrics, all normalized so a higher percentile is
 * always better regardless of whether the underlying column itself is
 * better-when-lower (price) or better-when-higher (alcohol grams per euro).
 */
const metricDefinitions: MetricDefinition[] = [
	pricePerLiterMetric,
	{
		key: AllColumns.AlcoholGramsPerEuro,
		label: 'Alkoholia rahalle',
		higherIsBetter: true,
		note: (p) => `Enemmän alkoholia/€ kuin ${p} %:lla vastaavista`
	},
	sugarMetric,
	{
		key: AllColumns.PromillePerEuro,
		label: 'Promillet per euro',
		higherIsBetter: true,
		note: (p) => `Enemmän promilleja/€ kuin ${p} %:lla vastaavista`
	}
];

const alcoholFreeTypeSlug = 'alkoholittomat';

/**
 * Metrics for alcohol-free products, whose peers are all alcohol-free too, so
 * alcohol per euro would be zero across the board. Their calories come almost
 * entirely from sugar, so energy would repeat the sugar ranking, except in
 * beers, where unfermented malt sugars add calories that aren't sugar.
 */
function alcoholFreeMetricDefinitions(subTypeSlug: string): MetricDefinition[] {
	if (subTypeSlug !== 'alkoholittomat-oluet') return [pricePerLiterMetric, sugarMetric];
	return [
		pricePerLiterMetric,
		sugarMetric,
		{
			key: AllColumns.Energy,
			label: 'Energia',
			higherIsBetter: false,
			note: (p) => `Vähemmän kaloreita kuin ${p} %:lla vastaavista`
		}
	];
}

/**
 * The alcoholic categories alcohol-free subtypes stand in for, keyed by the
 * `Alatyyppi` slug, to show whether the alcohol-free version costs more. `name`
 * is the category in the plural for the card's label, `elative` the same in
 * the elative plural for its note.
 */
const alcoholicCounterparts: Record<
	string,
	{ type: string; subTypes: string[]; name: string; elative: string }
> = {
	'alkoholittomat-punaviinit': {
		type: 'Viinit',
		subTypes: ['punaviinit'],
		name: 'punaviinit',
		elative: 'punaviineistä'
	},
	'alkoholittomat-valko-ja-roseeviinit': {
		type: 'Viinit',
		subTypes: ['valkoviinit', 'roseeviinit'],
		name: 'valko- ja roseeviinit',
		elative: 'valko- ja roseeviineistä'
	},
	'alkoholittomat-kuohuviinit': {
		type: 'Viinit',
		subTypes: ['kuohuviinit ja samppanjat'],
		name: 'kuohuviinit',
		elative: 'kuohuviineistä'
	},
	'alkoholittomat-oluet': {
		type: 'Panimotuotteet',
		subTypes: ['oluet'],
		name: 'oluet',
		elative: 'oluista'
	},
	'alkoholittomat-siiderit': {
		type: 'Panimotuotteet',
		subTypes: ['siiderit'],
		name: 'siiderit',
		elative: 'siidereistä'
	}
};

/**
 * Where `product`'s price per liter falls among the alcoholic version of its
 * category, or null when it has none (e.g. mixers) or nothing to compare to.
 */
function alcoholicPriceMetric(
	product: PriceListItem,
	subTypeSlug: string,
	kaljakori: Kaljakori
): QualityMetric | null {
	const counterpart = alcoholicCounterparts[subTypeSlug];
	const productPrice = Number(product[AllColumns.PricePerLiter]);
	if (!counterpart || !(productPrice > 0)) return null;

	const subTypeSlugs = new Set(counterpart.subTypes.map(categorySlug));
	const prices = positiveValues(
		kaljakori.data.filter(
			(item) =>
				item[AllColumns.RemovedFromSelection] !== true &&
				categorySlug(String(item[AllColumns.Type] ?? '')) === categorySlug(counterpart.type) &&
				subTypeSlugs.has(categorySlug(String(item[AllColumns.SubType] ?? '')))
		),
		AllColumns.PricePerLiter
	);
	const medianPrice = median(prices);
	if (medianPrice === null) return null;

	const percentile = Math.round(
		(prices.filter((price) => price >= productPrice).length / prices.length) * 100
	);
	return {
		key: alcoholicPricePerLiterKey,
		label: `Litrahinta vs. alkoholilliset ${counterpart.name}`,
		value: String(formatValue(productPrice, AllColumns.PricePerLiter)),
		comparison: `vs. ${formatRoundedPricePerLiter(medianPrice)}`,
		percentile,
		barPercent: percentile,
		note: `Halvempi litrahinta kuin ${percentile} %:lla alkoholillisista ${counterpart.elative}. Mediaani ${formatRoundedPricePerLiter(medianPrice)}`
	};
}

/** The `Alatyyppi` slug of an alcohol-free product, or null for other products. */
function alcoholFreeSubTypeSlug(product: PriceListItem): string | null {
	if (categorySlug(String(product[AllColumns.Type] ?? '')) !== alcoholFreeTypeSlug) return null;
	return categorySlug(String(product[AllColumns.SubType] ?? ''));
}

/** True for products in Alko's alcohol-free category. */
export function isAlcoholFree(product: PriceListItem): boolean {
	return alcoholFreeSubTypeSlug(product) !== null;
}

/**
 * How many cards {@link computeQualityMetrics} gives `product` when it has
 * peers, for sizing the section before the price list has loaded.
 */
export function qualityMetricCount(product: PriceListItem): number {
	const subTypeSlug = alcoholFreeSubTypeSlug(product);
	if (subTypeSlug === null) return metricDefinitions.length;
	return (
		alcoholFreeMetricDefinitions(subTypeSlug).length +
		(subTypeSlug in alcoholicCounterparts ? 1 : 0)
	);
}

/**
 * Computes percentile-based "Hinta-laatu" metrics for `product` against other
 * products in its category: the `Alatyyppi` when it has one, or the whole
 * `Tyyppi` with `parentCategory`. Alcohol-free products get their own metric
 * set. Returns an empty `metrics` array when there are no comparable peers,
 * so callers can hide the section.
 */
export function computeQualityMetrics(
	product: PriceListItem,
	kaljakori: Kaljakori,
	{ parentCategory = false }: { parentCategory?: boolean } = {}
): QualityMetricsResult {
	// Same trail the "Selaa kategoriaa" link uses, so the compared group is the category page's products
	const { trail } = findProductCategoryTrail(
		kaljakori.getCategoryTree(),
		product[AllColumns.Type],
		product[AllColumns.SubType]
	);
	const typeNode = trail[0];
	const subTypeNode = parentCategory ? undefined : trail[1];
	const category = String(
		(subTypeNode ?? typeNode)?.name ?? product[AllColumns.SubType] ?? product[AllColumns.Type]
	);

	const sameCategory = (item: PriceListItem) => {
		if (!typeNode) return item[AllColumns.Type] === product[AllColumns.Type];
		if (categorySlug(String(item[AllColumns.Type] ?? '')) !== typeNode.slug) return false;
		return (
			!subTypeNode || categorySlug(String(item[AllColumns.SubType] ?? '')) === subTypeNode.slug
		);
	};
	const peers = kaljakori.data.filter(
		(item) =>
			sameCategory(item) &&
			item[AllColumns.RemovedFromSelection] !== true &&
			item[AllColumns.Number] !== product[AllColumns.Number]
	);
	const sampleSize = peers.length;

	if (sampleSize === 0) {
		return {
			metrics: [],
			sampleSize: 0,
			categoryLabel: category,
			medianPricePerLiter: null
		};
	}

	const subTypeSlug = alcoholFreeSubTypeSlug(product);
	const definitions =
		subTypeSlug === null ? metricDefinitions : alcoholFreeMetricDefinitions(subTypeSlug);
	const metrics: QualityMetric[] = definitions.map((def) => {
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
	const alcoholicPrice =
		subTypeSlug === null ? null : alcoholicPriceMetric(product, subTypeSlug, kaljakori);
	if (alcoholicPrice) metrics.push(alcoholicPrice);

	return {
		metrics,
		sampleSize,
		categoryLabel: category,
		medianPricePerLiter: median(positiveValues([product, ...peers], AllColumns.PricePerLiter))
	};
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
	[AllColumns.EuroPerServing]: 'lower',
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

	const zeroIsMissing = zeroWithoutAlcoholColumns.has(key);
	const numericValues = products
		.map((product) => Number(product[key]))
		.filter((value) => Number.isFinite(value) && !(zeroIsMissing && value === 0));

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
	/** True when the displayed values are not identical across the compared products. */
	differs: boolean;
};

/** True when `key` is displayed differently for at least two of `products`. */
export function valuesDiffer(products: PriceListItem[], key: ColumnNames): boolean {
	const values = products.map((product) =>
		String(formatValue(product[key] as string | number | boolean | Set<string>, key))
	);
	return new Set(values).size > 1;
}

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
	const columns = [
		...Object.values(DatasetColumns),
		...Object.values(DrunkColumns)
	] as ColumnNames[];

	const rows: ComparisonRow[] = [];

	for (const key of columns) {
		if (hideFromProductPageStats.has(key)) continue;
		if (!products.some((product) => hasComparableValue(product[key]))) continue;

		const bestProductNumbers = getBestProductNumbers(products, key);
		const cells = products.map((product) => ({
			product,
			value: String(formatValue(product[key] as string | number | boolean | Set<string>, key)),
			isBest: bestProductNumbers.has(product[AllColumns.Number])
		}));

		rows.push({
			key,
			label: headerToDisplayName(key),
			cells,
			differs: new Set(cells.map((cell) => cell.value)).size > 1
		});
	}

	return rows;
}

function median(values: number[]): number | null {
	if (values.length === 0) return null;
	const sorted = [...values].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function positiveValues(products: PriceListItem[], key: ColumnNames): number[] {
	return products
		.map((product) => Number(product[key]))
		.filter((value) => Number.isFinite(value) && value > 0);
}

export type HistogramBin = { from: number; to: number; count: number };

/**
 * Splits `values` into `binCount` equal-width bins between the 5th and 95th
 * percentile, so a few extreme bottles don't flatten the rest into one bar.
 * Values outside that range are counted in the first or last bin.
 */
export function histogram(values: number[], binCount = 10): HistogramBin[] {
	if (values.length === 0) return [];
	const sorted = [...values].sort((a, b) => a - b);
	const min = sorted[Math.floor((sorted.length - 1) * 0.05)];
	const max = sorted[Math.ceil((sorted.length - 1) * 0.95)];
	if (max <= min) return [{ from: min, to: max, count: values.length }];

	const width = (max - min) / binCount;
	const bins = Array.from({ length: binCount }, (_, index) => ({
		from: min + index * width,
		to: min + (index + 1) * width,
		count: 0
	}));
	for (const value of sorted) {
		const index = Math.min(binCount - 1, Math.max(0, Math.floor((value - min) / width)));
		bins[index].count += 1;
	}
	return bins;
}

/** Index of the bin `value` falls in, with values outside the range clamped to the edge bins. */
export function histogramBinIndex(bins: HistogramBin[], value: number): number {
	if (bins.length === 0) return -1;
	const index = bins.findIndex((bin) => value < bin.to);
	return index === -1 ? bins.length - 1 : index;
}

export type CategoryStats = {
	medianPrice: number | null;
	medianPricePerLiter: number | null;
	medianAlcoholPercentage: number | null;
	medianAlcoholGramsPerEuro: number | null;
	pricePerLiterHistogram: HistogramBin[];
};

/** Medians and the price-per-liter spread of a category's products. */
export function computeCategoryStats(products: PriceListItem[]): CategoryStats {
	const pricePerLiter = positiveValues(products, AllColumns.PricePerLiter);
	return {
		medianPrice: median(positiveValues(products, AllColumns.Price)),
		medianPricePerLiter: median(pricePerLiter),
		medianAlcoholPercentage: median(positiveValues(products, AllColumns.AlcoholPercentage)),
		medianAlcoholGramsPerEuro: median(positiveValues(products, AllColumns.AlcoholGramsPerEuro)),
		pricePerLiterHistogram: histogram(pricePerLiter)
	};
}

export type PriceChange = {
	product: PriceListItem;
	date: string;
	from: number;
	to: number;
	percent: number;
	/** The new price is a campaign price below the normal price. */
	sale: boolean;
};

/**
 * Each product's latest price change on or after `since` (YYYY-MM-DD),
 * newest first. Products without a change in that window are left out.
 */
export function recentPriceChanges(products: PriceListItem[], since: string): PriceChange[] {
	const changes: PriceChange[] = [];
	for (const product of products) {
		const history = product[AllColumns.History] ?? [];
		for (let index = history.length - 1; index > 0; index -= 1) {
			const current = history[index];
			if (current.date < since) break;
			const previous = history[index - 1];
			if (previous.price === current.price || !previous.price) continue;
			changes.push({
				product,
				date: current.date,
				from: previous.price,
				to: current.price,
				percent: ((current.price - previous.price) / previous.price) * 100,
				sale: current.normalPrice != null && current.price < current.normalPrice
			});
			break;
		}
	}
	return changes.sort((a, b) => b.date.localeCompare(a.date) || a.percent - b.percent);
}

/**
 * A handful of a category's standout products for the comparison view: the
 * most alcohol per euro, the cheapest and the lowest price per liter, topped
 * up with the next best by alcohol per euro.
 */
export function pickCategoryHighlights(products: PriceListItem[], limit: number): PriceListItem[] {
	const valid = products.filter((product) => Number(product[AllColumns.Price]) > 0);
	const byAlcoholPerEuro = [...valid].sort(
		(a, b) => b[AllColumns.AlcoholGramsPerEuro] - a[AllColumns.AlcoholGramsPerEuro]
	);
	const lowest = (key: ColumnNames) =>
		valid.reduce<PriceListItem | undefined>(
			(best, product) => (!best || Number(product[key]) < Number(best[key]) ? product : best),
			undefined
		);

	const picks = new Map<string, PriceListItem>();
	for (const product of [
		byAlcoholPerEuro[0],
		lowest(AllColumns.Price),
		lowest(AllColumns.PricePerLiter),
		...byAlcoholPerEuro.slice(1)
	]) {
		if (picks.size >= limit) break;
		if (product) picks.set(product[AllColumns.Number], product);
	}
	return [...picks.values()];
}

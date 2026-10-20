// Derived numbers the prerendered product stubs show on top of Alko's own fields:
// value metrics, the product's place in its category and a price-history summary.
// This is the content alko.fi doesn't have, so it is what makes a stub worth indexing.
// Kept free of `$lib` imports and side effects so tests can import it directly.

import type { CategoryNode } from '../../src/lib/utils/catalog/categories.ts';
import type { StoredProduct } from '../../src/lib/utils/catalog/dataset.ts';

/** Same constants as the app's calculator (src/lib/utils/alko.ts) */
const ETHANOL_DENSITY = 789; // g/l
const SERVING_GRAMS = 12;

/** Only the top of each category shows a rank, so price changes elsewhere don't re-render every page */
export const CATEGORY_RANK_LIMIT = 10;

export type AlcoholMetrics = {
	grams: number;
	servings: number;
	gramsPerEuro: number;
	pricePerServing: number;
};

export function alcoholMetrics(
	volumeLitres: number | null,
	alcoholPercentage: number | null,
	price: number | null
): AlcoholMetrics | null {
	if (!volumeLitres || !alcoholPercentage || !price) return null;
	const grams = volumeLitres * (alcoholPercentage / 100) * ETHANOL_DENSITY;
	const servings = grams / SERVING_GRAMS;
	if (!Number.isFinite(grams) || grams <= 0 || servings <= 0) return null;
	return { grams, servings, gramsPerEuro: grams / price, pricePerServing: price / servings };
}

export type CategoryProduct = {
	id: string;
	name: string;
	price: number;
	alcoholPerEuro: number;
	typeSlug: string;
	subTypeSlug: string;
};

export type CategoryGroup = { trail: CategoryNode[]; products: CategoryProduct[] };

/**
 * Every category page's products, best alcohol per euro first. The index page
 * (empty trail) comes first. Shared by the category pages and the product ranks,
 * so "#3 in Punaviinit" on a product page is exactly position 3 on that category page.
 */
export function categoryGroups(tree: CategoryNode[], products: CategoryProduct[]): CategoryGroup[] {
	const sorted = [...products].sort((a, b) => b.alcoholPerEuro - a.alcoholPerEuro);
	const groups: CategoryGroup[] = [{ trail: [], products: [] }];
	for (const type of tree) {
		groups.push({
			trail: [type],
			products: sorted.filter((product) => product.typeSlug === type.slug)
		});
		for (const subType of type.children) {
			groups.push({
				trail: [type, subType],
				products: sorted.filter(
					(product) => product.typeSlug === type.slug && product.subTypeSlug === subType.slug
				)
			});
		}
	}
	return groups;
}

export type CategoryRank = { rank: number; total: number; name: string; path: string };

/** Rank within the product's own (deepest) category, for products in its top `limit` only */
export function categoryRanks(
	groups: CategoryGroup[],
	limit = CATEGORY_RANK_LIMIT
): Map<string, CategoryRank> {
	const ranks = new Map<string, CategoryRank>();
	for (const { trail, products } of groups) {
		const node = trail.at(-1);
		if (!node) continue;
		products.slice(0, limit).forEach((product, index) => {
			const existing = ranks.get(product.id);
			// A subtype rank is more specific than its type's, so it wins
			if (existing && existing.path.length > node.path.length) return;
			ranks.set(product.id, {
				rank: index + 1,
				total: products.length,
				name: node.name,
				path: node.path
			});
		});
	}
	return ranks;
}

export type PricePoint = { price: number; date: string };

export type PriceHistorySummary = {
	trackedSince: string;
	lowest: PricePoint;
	highest: PricePoint;
	/** The most recent price change, null when the price has never changed */
	lastChange: { date: string; from: number; to: number } | null;
};

export function priceHistorySummary(
	history: StoredProduct['priceHistory']
): PriceHistorySummary | null {
	const points = (Array.isArray(history) ? history : [])
		.filter((point) => point && Number.isFinite(point.price) && point.price > 0 && point.date)
		.map((point) => ({ price: point.price, date: point.date }))
		// Stable, so same-day entries keep their recorded order
		.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
	if (points.length === 0) return null;

	let lowest = points[0];
	let highest = points[0];
	let lastChange: PriceHistorySummary['lastChange'] = null;
	for (let index = 1; index < points.length; index += 1) {
		const point = points[index];
		// Strict comparisons keep the first date a record price was seen
		if (point.price < lowest.price) lowest = point;
		if (point.price > highest.price) highest = point;
		const previous = points[index - 1];
		if (point.price !== previous.price) {
			lastChange = { date: point.date, from: previous.price, to: point.price };
		}
	}
	return { trackedSince: points[0].date, lowest, highest, lastChange };
}

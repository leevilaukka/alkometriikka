import type { PriceListItem } from '$lib/types';
import { AllColumns } from '$lib/utils/constants/columns';

/**
 * The strongest drinks grocery stores may sell (alcohol act, 2024): fermented drinks such as beer,
 * cider and wine up to 8 %, drinks mixed from spirits (long drinks) only up to 5.5 %. Anything
 * stronger is sold only by Alko, so there's nothing to look for elsewhere.
 */
const GROCERY_MAX_ABV = 8;
const GROCERY_MAX_ABV_MIXED = 5.5;
const MIXED_DRINK_SUBTYPE = 'juomasekoitukset';

export type GroceryLink = { id: 's-kaupat' | 'k-ruoka'; name: string; href: string };

/** Search pages of the grocery chains' online stores. They search by name; S-kaupat finds nothing by EAN. */
const GROCERY_SEARCHES: { id: GroceryLink['id']; name: string; url: (query: string) => string }[] =
	[
		{
			id: 's-kaupat',
			name: 'S-kaupat',
			url: (query) =>
				`https://www.s-kaupat.fi/hakutulokset?queryString=${encodeURIComponent(query)}`
		},
		{
			id: 'k-ruoka',
			name: 'K-Ruoka',
			url: (query) => `https://www.k-ruoka.fi/haku?q=${encodeURIComponent(query)}`
		}
	];

/** Whether grocery stores may sell the product at all */
export function soldInGroceryStores(product: PriceListItem): boolean {
	const value = product[AllColumns.AlcoholPercentage];
	// Number(null) would be 0, which reads as non-alcoholic
	const abv = value === null || value === undefined ? NaN : Number(value);
	if (!Number.isFinite(abv) || abv < 0) return false;
	const mixed = String(product[AllColumns.SubType] ?? '').toLowerCase() === MIXED_DRINK_SUBTYPE;
	return abv <= (mixed ? GROCERY_MAX_ABV_MIXED : GROCERY_MAX_ABV);
}

/**
 * Links that search the grocery chains for the product, so its shelf price there can be compared.
 * Alko's full name ("Sandels 4,7% tölkki") narrows the results well, so it's used as it is. Empty
 * for products grocery stores can't sell.
 */
export function groceryLinks(product: PriceListItem): GroceryLink[] {
	const query = String(product[AllColumns.Name] ?? '')
		.replace(/\s+/g, ' ')
		.trim();
	if (!query || !soldInGroceryStores(product)) return [];
	return GROCERY_SEARCHES.map(({ id, name, url }) => ({ id, name, href: url(query) }));
}

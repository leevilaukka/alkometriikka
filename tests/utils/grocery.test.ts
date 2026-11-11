import { describe, expect, it } from 'bun:test';
import type { PriceListItem } from '$lib/types';
import { groceryLinks, soldInGroceryStores } from '$lib/utils/catalog/grocery';
import { AllColumns } from '$lib/utils/constants/columns';

function product(name: string, abv: number | null, subType = 'oluet'): PriceListItem {
	return {
		[AllColumns.Name]: name,
		[AllColumns.AlcoholPercentage]: abv,
		[AllColumns.SubType]: subType
	} as unknown as PriceListItem;
}

describe('soldInGroceryStores', () => {
	it('allows fermented drinks up to 8 % and mixed drinks up to 5.5 %', () => {
		expect(soldInGroceryStores(product('Sandels 4,7% tölkki', 4.7))).toBe(true);
		expect(soldInGroceryStores(product('Vahva olut', 8))).toBe(true);
		expect(soldInGroceryStores(product('Kuohuviini', 8, 'kuohuviinit ja samppanjat'))).toBe(true);
		expect(soldInGroceryStores(product('Bavaria 0,0% tölkki', 0, 'alkoholittomat'))).toBe(true);
		expect(soldInGroceryStores(product('Original Long Drink', 5.5, 'juomasekoitukset'))).toBe(true);
	});

	it('leaves out stronger drinks and unknown strengths', () => {
		expect(soldInGroceryStores(product('Tuplabock', 8.5))).toBe(false);
		expect(soldInGroceryStores(product('Vahva lonkero', 7, 'juomasekoitukset'))).toBe(false);
		expect(soldInGroceryStores(product('Koskenkorva', 38, 'viinat'))).toBe(false);
		expect(soldInGroceryStores(product('Tuntematon', null))).toBe(false);
	});
});

describe('groceryLinks', () => {
	it('searches both chains by the full name, spaces tidied', () => {
		expect(groceryLinks(product('Bavaria 0,0%  tölkki', 0))).toEqual([
			{
				id: 's-kaupat',
				name: 'S-kaupat',
				href: 'https://www.s-kaupat.fi/hakutulokset?queryString=Bavaria%200%2C0%25%20t%C3%B6lkki'
			},
			{
				id: 'k-ruoka',
				name: 'K-Ruoka',
				href: 'https://www.k-ruoka.fi/haku?q=Bavaria%200%2C0%25%20t%C3%B6lkki'
			}
		]);
	});

	it('has none for products only Alko sells', () => {
		expect(groceryLinks(product('Koskenkorva', 38, 'viinat'))).toEqual([]);
	});
});

import { describe, expect, it } from 'bun:test';
import type { Kaljakori } from '$lib/alko';
import type { PriceListItem } from '$lib/types';
import { AllColumns } from './constants';
import { buildSizeOptions, findSimilarProducts, SIMILAR_PRODUCT_COLUMNS } from './filters';

type Fields = {
	name: string;
	type: string;
	subType: string;
	beerType?: string;
	price: number;
	volume: number;
	alcohol: number;
	sugar: number;
	packaging: string;
	grapes?: string[];
	description?: string[];
	removed?: boolean;
};

function product(id: string, fields: Fields): PriceListItem {
	return {
		[AllColumns.Number]: id,
		[AllColumns.Name]: fields.name,
		[AllColumns.Type]: fields.type,
		[AllColumns.SubType]: fields.subType,
		[AllColumns.BeerType]: fields.beerType ?? '',
		[AllColumns.Price]: fields.price,
		[AllColumns.BottleSize]: fields.volume,
		[AllColumns.PricePerLiter]: fields.price / fields.volume,
		[AllColumns.AlcoholPercentage]: fields.alcohol,
		[AllColumns.AlcoholGramsPerEuro]:
			(fields.volume * 1000 * (fields.alcohol / 100) * 0.789) / fields.price,
		[AllColumns.Sugar]: fields.sugar,
		[AllColumns.PackagingType]: fields.packaging,
		[AllColumns.GrapeVarieties]: new Set(fields.grapes ?? []),
		[AllColumns.Description]: new Set(fields.description ?? []),
		[AllColumns.RemovedFromSelection]: fields.removed ?? false
	} as unknown as PriceListItem;
}

const lager = {
	type: 'Oluet',
	subType: 'Lager ja pils',
	beerType: 'Lager',
	alcohol: 4.6,
	sugar: 0,
	packaging: 'tölkki',
	description: ['Kullankeltainen', 'Keskitäyteläinen', 'Maltainen']
};

const catalog = [
	product('karhu-033', { ...lager, name: 'Karhu III tölkki', price: 1.99, volume: 0.33 }),
	product('karhu-05', { ...lager, name: 'Karhu III tölkki', price: 2.69, volume: 0.5 }),
	product('karhu-0568', { ...lager, name: 'Karhu III tölkki', price: 2.99, volume: 0.568 }),
	product('koff-033', { ...lager, name: 'Koff III tölkki', price: 1.95, volume: 0.33 }),
	product('lapin-033', {
		...lager,
		name: 'Lapin Kulta III tölkki',
		price: 2.09,
		volume: 0.33,
		description: ['Kullankeltainen', 'Kevyt', 'Raikas']
	}),
	product('ipa-033', {
		...lager,
		beerType: 'India Pale Ale',
		subType: 'Ale',
		name: 'Humala IPA tölkki',
		price: 3.49,
		volume: 0.33,
		alcohol: 6.5,
		description: ['Meripihkainen', 'Täyteläinen', 'Humalainen']
	}),
	product('cabernet', {
		type: 'Punaviinit',
		subType: 'Mehevä ja hilloinen',
		name: 'Cabernet Sauvignon',
		price: 12.98,
		volume: 0.75,
		alcohol: 13.5,
		sugar: 6,
		packaging: 'pullo',
		grapes: ['Cabernet Sauvignon'],
		description: ['Tumma kirsikanpunainen', 'Täyteläinen', 'Tanniininen']
	}),
	product('vodka', {
		type: 'Vodkat ja viinat',
		subType: 'Maustamattomat',
		name: 'Koskenkorva Vodka',
		price: 21.99,
		volume: 0.7,
		alcohol: 40,
		sugar: 0,
		packaging: 'pullo'
	})
];

const numberColumns = new Set<string>([
	AllColumns.Price,
	AllColumns.BottleSize,
	AllColumns.Sugar,
	AllColumns.AlcoholGramsPerEuro
]);

function kaljakoriOf(data: PriceListItem[], variants: Record<string, string[]> = {}): Kaljakori {
	const byId = new Map(data.map((item) => [item[AllColumns.Number], item]));
	return {
		data,
		getFilterType: (key: string) => (numberColumns.has(key) ? 'number' : 'string'),
		findDifferentSizesOfProduct: (item: PriceListItem) =>
			(variants[item[AllColumns.Number]] ?? []).map((id) => byId.get(id)!)
	} as unknown as Kaljakori;
}

const ids = (items: PriceListItem[]) => items.map((item) => item[AllColumns.Number]);

function rank(referenceId: string, limit = catalog.length) {
	const reference = catalog.find((item) => item[AllColumns.Number] === referenceId)!;
	return ids(findSimilarProducts(reference, kaljakoriOf(catalog), SIMILAR_PRODUCT_COLUMNS, limit));
}

describe('findSimilarProducts', () => {
	it('never returns the reference product itself', () => {
		expect(rank('karhu-033')).not.toContain('karhu-033');
		expect(rank('karhu-033')).toHaveLength(catalog.length - 1);
	});

	it('ranks other sizes of the same product above unrelated products', () => {
		const ranking = rank('karhu-033');
		for (const variant of ['karhu-05', 'karhu-0568']) {
			expect(ranking.indexOf(variant)).toBeLessThan(ranking.indexOf('cabernet'));
			expect(ranking.indexOf(variant)).toBeLessThan(ranking.indexOf('vodka'));
		}
	});

	it('ranks closely related products first and a different beer style below them', () => {
		const ranking = rank('karhu-033');
		// Same style, size, packaging, price and characteristics
		expect(ranking[0]).toBe('koff-033');
		expect(ranking.indexOf('lapin-033')).toBeLessThan(ranking.indexOf('ipa-033'));
		expect(ranking.indexOf('ipa-033')).toBeLessThan(ranking.indexOf('cabernet'));
	});

	it('puts products of other categories last', () => {
		expect(rank('karhu-033').slice(-2).sort()).toEqual(['cabernet', 'vodka']);
		const wine = rank('cabernet');
		expect(wine.indexOf('vodka')).toBeGreaterThan(-1);
		expect(wine.slice(0, 5).every((id) => id !== 'cabernet')).toBe(true);
	});

	it('respects the limit', () => {
		expect(rank('karhu-033', 3)).toEqual(rank('karhu-033').slice(0, 3));
	});
});

describe('buildSizeOptions', () => {
	const single = product('olut-033', { ...lager, name: 'Olut', price: 2, volume: 0.33 });
	const big = product('olut-05', { ...lager, name: 'Olut', price: 2.5, volume: 0.5 });
	const sixPack = product('olut-6', { ...lager, name: 'Olut 6-pack', price: 9.5, volume: 1.98 });
	const removedCheap = product('olut-1', {
		...lager,
		name: 'Olut',
		price: 1,
		volume: 1,
		removed: true
	});

	it('returns only the product itself when it comes in a single size', () => {
		const sizes = buildSizeOptions(single, kaljakoriOf([single]));
		expect(sizes).toHaveLength(1);
		expect(sizes[0]).toMatchObject({ isCurrent: true, isBestValue: true, barPercent: 100 });
	});

	it('orders single packs before multipacks and flags the cheapest per liter', () => {
		const kaljakori = kaljakoriOf([single, big, sixPack], { 'olut-033': ['olut-05', 'olut-6'] });
		const sizes = buildSizeOptions(single, kaljakori);
		expect(ids(sizes.map((size) => size.product))).toEqual(['olut-033', 'olut-05', 'olut-6']);
		expect(sizes.map((size) => size.packCount)).toEqual([1, 1, 6]);
		expect(
			sizes.filter((size) => size.isBestValue).map((size) => size.product[AllColumns.Number])
		).toEqual(['olut-6']);
		expect(sizes.find((size) => size.isCurrent)?.product).toBe(single);
	});

	it('leaves out sizes removed from the selection', () => {
		const kaljakori = kaljakoriOf([single, big, removedCheap], {
			'olut-033': ['olut-05', 'olut-1']
		});
		const sizes = buildSizeOptions(single, kaljakori);
		expect(ids(sizes.map((size) => size.product))).toEqual(['olut-033', 'olut-05']);
		expect(sizes.find((size) => size.isBestValue)?.product).toBe(big);
	});

	it('keeps a removed product as the current size', () => {
		const kaljakori = kaljakoriOf([removedCheap, single], { 'olut-1': ['olut-033'] });
		const sizes = buildSizeOptions(removedCheap, kaljakori);
		expect(sizes.find((size) => size.isCurrent)?.product).toBe(removedCheap);
		expect(sizes).toHaveLength(2);
	});
});

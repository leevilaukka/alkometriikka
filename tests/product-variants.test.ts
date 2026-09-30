import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PriceListItem } from '../src/lib/types';
import { AllColumns as C } from '../src/lib/utils/constants.ts';
import {
	getComparableProductName,
	ProductVariantIndex
} from '../src/lib/utils/product-variants.ts';

function product(id: string, name: string, overrides: Partial<PriceListItem> = {}): PriceListItem {
	return {
		[C.Number]: id,
		[C.Name]: name,
		[C.Manufacturer]: 'Sinebrychoff',
		[C.Type]: 'Panimotuotteet',
		[C.SubType]: 'Oluet',
		[C.BeerType]: 'Lager',
		[C.Country]: 'Suomi',
		[C.Vintage]: '',
		[C.AlcoholPercentage]: 4.6,
		[C.BottleSize]: 0.33,
		[C.PackagingType]: 'Tölkki',
		[C.OriginalGravity]: 10,
		[C.BitternessEBU]: 16,
		[C.Energy]: 38,
		[C.GrapeVarieties]: new Set(),
		[C.Description]: new Set([
			'Kellanruskea',
			'Keskitäyteläinen',
			'Keskiasteisesti humaloitu',
			'Hedelmäinen',
			'Kevyen maltainen'
		]),
		...overrides
	} as PriceListItem;
}

function index(products: PriceListItem[], unknownSizes: PriceListItem[] = []) {
	return new ProductVariantIndex(
		products,
		new Set(products.filter((p) => !unknownSizes.includes(p)))
	);
}

function ids(values: PriceListItem[]) {
	return values.map((p) => p[C.Number]);
}

test('G, R and W stay separate, even if their package sizes differ', () => {
	const products = ['G', 'R', 'W'].map((letter, i) =>
		product(String(i), `Sober Spirits ${letter} 0.0%`, {
			[C.AlcoholPercentage]: 0,
			[C.Type]: 'Alkoholittomat',
			[C.SubType]: 'Muut alkoholittomat',
			[C.BottleSize]: 0.5 + i * 0.2,
			[C.Manufacturer]: 'Sober Spirits'
		})
	);
	const matcher = index(products);
	for (const p of products) assert.deepEqual(matcher.find(p), []);
});

test('long shared prefixes cannot hide different beer styles or extra identity words', () => {
	const a = product('1', 'Suomenlinnan Ton Alkoholiton IPA tölkki');
	const b = product('2', 'Suomenlinnan Ton Alkoholiton Lager tölkki', { [C.BottleSize]: 0.5 });
	const c = product('3', 'Suomenlinnan Ton Alkoholiton IPA Special tölkki', {
		[C.BottleSize]: 0.75
	});
	assert.deepEqual(index([a, b, c]).find(a), []);
});

test('ages and release numbers remain part of identity', () => {
	const a = product('1', 'Glenfiddich 12 Year Old Single Malt', { [C.Type]: 'Väkevät' });
	const b = product('2', 'Glenfiddich 18 Year Old Single Malt', {
		[C.Type]: 'Väkevät',
		[C.BottleSize]: 0.05
	});
	const c = product('3', 'Glenfiddich 12 Year Old Single Malt', {
		[C.Type]: 'Väkevät',
		[C.BottleSize]: 0.7
	});
	assert.deepEqual(ids(index([a, b, c]).find(a)), ['3']);
	assert.notEqual(
		getComparableProductName(product('4', 'Waterford Gaia 1.2 Single Malt')),
		getComparableProductName(product('5', 'Waterford Gaia 2.1 Single Malt'))
	);
});

test('Roman editions and letters inside words are preserved', () => {
	const a = product('1', 'Christian Tschida Felsen I 2023', {
		[C.Type]: 'Viinit',
		[C.Vintage]: '2023'
	});
	const b = product('2', 'Christian Tschida Felsen II 2023', {
		[C.Type]: 'Viinit',
		[C.Vintage]: '2023',
		[C.BottleSize]: 0.75
	});
	assert.deepEqual(index([a, b]).find(a), []);
	assert.equal(
		getComparableProductName(product('3', 'Valhalla IPA Lager Single Malt')),
		'valhalla ipa lager single malt'
	);
});

test('package annotations, verified ABV and repeated packaging labels normalize automatically', () => {
	const a = product('1', '1664 Blanc 5,0% tölkki tölkki', { [C.AlcoholPercentage]: 5 });
	const b = product('2', '1664 Blanc 6-pack tölkki', {
		[C.AlcoholPercentage]: 5,
		[C.BottleSize]: 1.98
	});
	assert.equal(getComparableProductName(a), '1664 blanc');
	assert.deepEqual(ids(index([a, b]).find(a)), ['2']);
});

test('can and bottle of the same volume are package variants, identical packages are not', () => {
	const a = product('1', 'Karhu 4,6 tölkki');
	const b = product('2', 'Karhu 4,6', { [C.PackagingType]: 'Lasipullo' });
	const duplicate = product('3', 'Karhu 4,6 tölkki');
	assert.deepEqual(ids(index([a, b, duplicate]).find(a)), ['2']);
});

test('validated unit volumes and multipack notation retain package count', () => {
	const a = product('1', 'Example 500 ml tölkki', { [C.BottleSize]: 0.5 });
	const b = product('2', 'Example 6 × 0,5 l tölkki', { [C.BottleSize]: 3 });
	const c = product('3', 'Example 6-pack 50 cl tölkki', { [C.BottleSize]: 3 });
	const d = product('4', 'Example 10-pack 30 cl tölkki', { [C.BottleSize]: 3 });
	const matcher = index([a, b, c, d]);
	assert.deepEqual(ids(matcher.find(a)), ['2', '3', '4']);
	assert.deepEqual(ids(matcher.find(b)), ['1', '4']);
});

test('contradictory or unverified annotations cannot disappear into a match', () => {
	const a = product('1', 'Example');
	const products = [
		a,
		product('2', 'Example 5.5%', { [C.BottleSize]: 0.5 }),
		product('3', 'Example 75 cl', { [C.BottleSize]: 0.5 }),
		product('4', 'Example 6-pack 12-pack', { [C.BottleSize]: 0.5 }),
		product('5', 'Example 6 x 0,5 l', { [C.BottleSize]: 0.5 })
	];
	assert.deepEqual(index(products).find(a), []);
});

test('packaging removal respects word boundaries and preserves nonnumeric pack names', () => {
	assert.equal(
		getComparableProductName(product('1', 'Tölkkinen Wolf-pack tölkki')),
		'tölkkinen wolf-pack'
	);
});

test('blank canonical names never match', () => {
	const a = product('1', '4,6% tölkki');
	const b = product('2', '4.6% tölkki', { [C.BottleSize]: 0.5 });
	assert.deepEqual(index([a, b]).find(a), []);
});

test('accent equivalence finds names through the index while preserving Finnish letters', () => {
	const a = product('1', 'Réserve');
	const b = product('2', 'Reserve', { [C.BottleSize]: 0.5 });
	const c = product('3', 'Vara');
	const e = product('4', 'Värä', { [C.BottleSize]: 0.5 });
	const matcher = index([e, b, c, a]);
	assert.deepEqual(ids(matcher.find(a)), ['2']);
	assert.deepEqual(ids(matcher.find(b)), ['1']);
	assert.deepEqual(matcher.find(c), []);
});

test('ABV, vintage, category, beer style and country conflicts veto identity', () => {
	const a = product('1', 'Example 2025', { [C.Vintage]: '2025' });
	for (const change of [
		{ [C.AlcoholPercentage]: 5.3 },
		{ [C.Vintage]: '2024', [C.Name]: 'Example 2024' },
		{ [C.Country]: 'Ruotsi' },
		{ [C.SubType]: 'Siiderit' },
		{ [C.BeerType]: 'Ipa' },
		{ [C.Country]: '' },
		{ [C.AlcoholPercentage]: '' }
	]) {
		const b = product('2', 'Example 2025', {
			...change,
			[C.BottleSize]: 0.5
		} as Partial<PriceListItem>);
		assert.deepEqual(index([a, b]).find(a), [], JSON.stringify(change));
	}
});

test('known vintage and absent vintage are not treated as equivalent', () => {
	const a = product('1', 'Example 2025', { [C.Vintage]: '2025' });
	const b = product('2', 'Example', { [C.BottleSize]: 0.5 });
	assert.deepEqual(index([a, b]).find(a), []);
});

test('matching category labels can bridge the legacy category hierarchy', () => {
	const a = product('1', 'Example', { [C.Type]: 'Oluet', [C.SubType]: 'Lager' });
	const b = product('2', 'Example', { [C.BottleSize]: 0.5 });
	assert.deepEqual(ids(index([a, b]).find(a)), ['2']);
});

test('distinctive exact names survive producer changes and measurement variation', () => {
	const a = product('1', 'Valhalla', { [C.Manufacturer]: 'Anora Group', [C.Sugar]: 125 });
	const b = product('2', 'Valhalla', {
		[C.Manufacturer]: 'Altia Oyj',
		[C.Sugar]: 124,
		[C.BottleSize]: 0.04
	});
	assert.deepEqual(ids(index([a, b]).find(a)), ['2']);
});

test('generic grape names need producer agreement', () => {
	const a = product('1', 'Merlot', {
		[C.GrapeVarieties]: new Set(['Merlot']),
		[C.Manufacturer]: 'One'
	});
	const b = product('2', 'Merlot', { [C.Manufacturer]: 'Two', [C.BottleSize]: 0.5 });
	assert.deepEqual(index([a, b]).find(a), []);
});

test('estimated or absent bottle sizes cannot prove package differences', () => {
	const a = product('1', 'Example');
	const b = product('2', 'Example', { [C.BottleSize]: 1 });
	const matcher = index([a, b], [b]);
	assert.deepEqual(matcher.find(a), []);
	assert.deepEqual(matcher.find(b), []);
});

test('accent variations of generic names cannot bypass producer checks', () => {
	const a = product('1', 'Mérlot', {
		[C.GrapeVarieties]: new Set(['Merlot']),
		[C.Manufacturer]: 'One'
	});
	const b = product('2', 'Merlot', { [C.Manufacturer]: 'Two', [C.BottleSize]: 0.5 });
	const matcher = index([a, b]);
	assert.deepEqual(matcher.find(a), []);
	assert.deepEqual(matcher.find(b), []);
});

test('Karhu III recovers all sizes symmetrically without a brand-specific rule', () => {
	for (const brand of ['Karhu', 'Another Brewery Beer']) {
		const keg = product('0', `${brand} III`, { [C.BottleSize]: 30, [C.PackagingType]: 'Muu' });
		const products = [
			keg,
			product('1', `${brand} 4,6 tölkki`),
			product('2', `${brand} 4,6 tölkki`, { [C.BottleSize]: 0.5 }),
			product('3', `${brand} 4,6 6-pack tölkki`, { [C.BottleSize]: 3 }),
			product('4', `${brand} 4,6 18-pack tölkki`, { [C.BottleSize]: 5.94 }),
			product('5', `${brand} 4,6`, { [C.PackagingType]: 'Lasipullo' })
		];
		const matcher = index(products);
		assert.deepEqual(new Set(ids(matcher.find(keg))), new Set(['1', '2', '3', '4', '5']));
		for (const p of products.slice(1)) assert.ok(matcher.find(p).includes(keg));
	}
});

test('a class qualifier can be recognized without touching numbers inside the name', () => {
	const a = product('1', 'Example IV A 8-pack tölkki', {
		[C.BottleSize]: 2.64,
		[C.AlcoholPercentage]: 5.2
	});
	const b = product('2', 'Example 5,2 tölkki', { [C.AlcoholPercentage]: 5.2 });
	assert.deepEqual(ids(index([a, b]).find(a)), ['2']);
	const c = product('3', 'Example IV A Barrel Edition', { [C.BottleSize]: 0.5 });
	assert.deepEqual(index([b, c]).find(b), []);
});

test('fallback rejects missing, default-zero or conflicting measurements and descriptions', () => {
	const a = product('1', 'Example III', { [C.BottleSize]: 30 });
	for (const change of [
		{ [C.OriginalGravity]: 0 },
		{ [C.BitternessEBU]: '' },
		{ [C.Energy]: 0 },
		{ [C.BitternessEBU]: 17 },
		{ [C.Manufacturer]: '' },
		{ [C.Manufacturer]: 'Another' },
		{ [C.Description]: new Set(['Kellanruskea']) },
		{
			[C.Description]: new Set([
				'Kellanruskea',
				'Keskitäyteläinen',
				'Savuinen',
				'Makea',
				'Mausteinen'
			])
		}
	]) {
		const b = product('2', 'Example 4,6', change as Partial<PriceListItem>);
		assert.deepEqual(index([a, b]).find(a), [], JSON.stringify(change));
	}
});

test('fallback normalizes descriptor order and string/array legacy representations', () => {
	const a = product('1', 'Example III', { [C.BottleSize]: 30 });
	const b = product('2', 'Example 4,6', {
		[C.Description]: new Set([
			'kevYEN maltainen, hedelmäinen, keskiasteisesti humaloitu, keskitäyteläinen, kellanruskea'
		])
	});
	assert.deepEqual(ids(index([a, b]).find(a)), ['2']);
});

test('fallback remains restricted to Finnish lagers', () => {
	for (const change of [
		{ [C.Country]: 'Ruotsi' },
		{ [C.BeerType]: 'Ipa' },
		{ [C.Type]: 'Viinit', [C.SubType]: 'Valkoviinit' }
	]) {
		const a = product('1', 'Example III', { ...change, [C.BottleSize]: 30 });
		const b = product('2', 'Example 4,6', change);
		assert.deepEqual(index([a, b]).find(a), []);
	}
});

test('competing Roman editions block the fallback, including same-size competitors', () => {
	const a = product('1', 'Example III', { [C.BottleSize]: 30 });
	const b = product('2', 'Example 4,6');
	const c = product('3', 'Example IV', { [C.BottleSize]: 30 });
	for (const products of [
		[a, b, c],
		[c, b, a]
	]) {
		const matcher = index(products);
		for (const p of products) assert.deepEqual(matcher.find(p), []);
	}
});

test('numeric ages and arbitrary one-letter identifiers never enter the suffix fallback', () => {
	for (const ending of ['12', 'G', 'R', 'W']) {
		const a = product('1', `Example ${ending}`, { [C.BottleSize]: 30 });
		const b = product('2', 'Example 4,6');
		assert.deepEqual(index([a, b]).find(a), []);
	}
});

test('results are deterministic, exclude self, and can be sorted without mutating the index', () => {
	const a = product('1', 'Example');
	const b = product('3', 'Example', { [C.BottleSize]: 0.5 });
	const c = product('2', 'Example', { [C.BottleSize]: 0.5 });
	const matcher = index([b, a, c]);
	assert.deepEqual(ids(matcher.find(a)), ['2', '3']);
	matcher.find(a).reverse();
	assert.deepEqual(ids(matcher.find(a)), ['2', '3']);
	assert.deepEqual(ids(index([c, a, b]).find(a)), ['2', '3']);
	assert.deepEqual(matcher.find(product('unknown', 'Example')), []);
});

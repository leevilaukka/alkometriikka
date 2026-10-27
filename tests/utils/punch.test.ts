import { describe, expect, it } from 'bun:test';
import { AllColumns } from '$lib/utils/constants/columns';
import { calculateDrunkValue } from '$lib/utils/catalog/alko';
import { GenderOptionsMap } from '$lib/utils/constants/app';
import { sortRows } from '$lib/utils/catalog/filters';
import {
	cheaperAlternative,
	computePunch,
	decodePunch,
	encodePunch,
	mixerForTarget,
	pickProduct,
	punchLines,
	resolveTemplate,
	sanitizePunch,
	scalePunch,
	type PunchRecipe
} from '$lib/utils/catalog/punch';
import type { PriceListItem } from '$lib/types';

const product = (
	id: string,
	{
		price,
		volume,
		abv,
		type = 'Viinit',
		subType = 'kuohuviinit ja samppanjat',
		removed = false,
		notes
	}: {
		price: number;
		volume: number;
		abv: number;
		type?: string;
		subType?: string;
		removed?: boolean;
		notes?: string[];
	}
) =>
	({
		[AllColumns.Number]: id,
		[AllColumns.Name]: `Tuote ${id}`,
		[AllColumns.Price]: price,
		[AllColumns.BottleSize]: volume,
		[AllColumns.AlcoholPercentage]: abv,
		[AllColumns.Type]: type,
		[AllColumns.SubType]: subType,
		[AllColumns.BeerType]: '',
		[AllColumns.Description]: notes && new Set(notes),
		[AllColumns.RemovedFromSelection]: removed,
		...calculateDrunkValue(volume, abv, price)
	}) as unknown as PriceListItem;

describe('price per serving', () => {
	it('divides the price by the 12 g servings', () => {
		// 0.7 l × 40 % × 789 g/l = 220.92 g = 18.41 servings
		expect(calculateDrunkValue(0.7, 40, 20)[AllColumns.EuroPerServing]).toBe(1.09);
	});

	it('is 0 without alcohol', () => {
		expect(calculateDrunkValue(0.33, 0, 2)[AllColumns.EuroPerServing]).toBe(0);
	});

	it('sorts alcohol-free products last in both directions', () => {
		const rows = [
			product('free', { price: 2, volume: 0.33, abv: 0 }),
			product('cheap', { price: 10, volume: 0.7, abv: 40 }),
			product('dear', { price: 30, volume: 0.7, abv: 40 })
		];
		const ids = (items: PriceListItem[]) => items.map((item) => item[AllColumns.Number]);
		expect(ids(sortRows([...rows], AllColumns.EuroPerServing, true))).toEqual([
			'cheap',
			'dear',
			'free'
		]);
		expect(ids(sortRows([...rows], AllColumns.EuroPerServing, false))).toEqual([
			'dear',
			'cheap',
			'free'
		]);
	});
});

describe('computePunch', () => {
	const sparkling = product('1', { price: 8, volume: 0.75, abv: 12 });
	const find = (id: string) => (id === '1' ? sparkling : undefined);

	it('mixes the ingredients into one bowl', () => {
		const lines = punchLines(
			[
				{ kind: 'alko', id: '1', count: 2 },
				{ kind: 'custom', name: 'Limu', volume: 1.5, abv: 0, price: 2, count: 1 }
			],
			find
		);
		const totals = computePunch(lines, { glass: 0.2, people: 3 });

		expect(totals.volume).toBeCloseTo(3);
		expect(totals.price).toBeCloseTo(18);
		// 1.5 l × 12 % = 0.18 l of alcohol in 3 l
		expect(totals.abv).toBeCloseTo(6);
		expect(totals.grams).toBeCloseTo(0.18 * 789);
		expect(totals.servings).toBeCloseTo((0.18 * 789) / 12);
		expect(totals.euroPerServing).toBeCloseTo(18 / ((0.18 * 789) / 12));
		expect(totals.glasses).toBeCloseTo(15);
		expect(totals.perGlass.price).toBeCloseTo(1.2);
		expect(totals.perPerson.price).toBeCloseTo(6);
		expect(totals.perPerson.glasses).toBeCloseTo(5);
		expect(totals.lines.map((line) => line.price)).toEqual([16, 2]);
	});

	it('estimates the promille the way the product pages do', () => {
		const lines = punchLines([{ kind: 'alko', id: '1', count: 1 }], find);
		const totals = computePunch(lines, {
			glass: 0.25,
			people: 1,
			gender: GenderOptionsMap.Male,
			weight: 80
		});
		const expected = calculateDrunkValue(0.75, 12, 8, GenderOptionsMap.Male, 80);
		expect(totals.promille).toBe(expected[AllColumns.EstimatedPromille]);
		expect(totals.perGlass.promille).toBeCloseTo(expected[AllColumns.EstimatedPromille] / 3);
	});

	it('leaves out products missing from the price list', () => {
		const lines = punchLines([{ kind: 'alko', id: '404', count: 3 }], find);
		expect(lines[0].missing).toBe(true);
		const totals = computePunch(lines, { glass: 0.2, people: 1 });
		expect(totals.volume).toBe(0);
		expect(totals.euroPerServing).toBeNull();
		expect(totals.perGlass.price).toBe(0);
	});
});

describe('mixerForTarget', () => {
	it('gives the litres of mixer that dilute to the target', () => {
		// 0.3 l of alcohol in 2 l is 15 %; at 6 % it fills 5 l
		expect(mixerForTarget({ alcohol: 0.3, volume: 2 }, 6)).toBeCloseTo(3);
	});

	it('is 0 when the punch is mild enough', () => {
		expect(mixerForTarget({ alcohol: 0.1, volume: 5 }, 6)).toBe(0);
	});

	it('rejects targets that dilution cannot reach', () => {
		expect(mixerForTarget({ alcohol: 0.1, volume: 1 }, 0)).toBeNull();
	});
});

describe('sharing', () => {
	const recipe: PunchRecipe = {
		name: 'Juhannus',
		description: 'Tarjoile kylmänä',
		glass: 0.25,
		people: 8,
		ingredients: [
			{ kind: 'alko', id: '123456', count: 3 },
			{ kind: 'custom', name: 'Limu', volume: 1.5, abv: 0, price: 1.89, count: 2 }
		]
	};

	it('round-trips a recipe', () => {
		expect(decodePunch(encodePunch(recipe))).toEqual(recipe);
	});

	it('keeps links without a description as short as before', () => {
		const without = encodePunch({ ...recipe, description: '' });
		expect(decodePunch(without)?.description).toBe('');
		expect(without.length).toBeLessThan(encodePunch(recipe).length);
	});

	it('rejects mangled links', () => {
		expect(decodePunch('not a recipe')).toBeNull();
		expect(decodePunch('')).toBeNull();
	});

	it('clamps values out of range', () => {
		const sanitized = sanitizePunch({
			name: 'x'.repeat(500),
			glass: 0,
			people: -2,
			ingredients: [
				{ kind: 'alko', id: '<script>', count: 1 },
				{ kind: 'custom', name: 'Viina', volume: 1, abv: 300, price: -1, count: 1 },
				null
			]
		});
		expect(sanitized?.name.length).toBe(30);
		expect(sanitizePunch({ ...recipe, description: 'x'.repeat(500) })?.description.length).toBe(
			100
		);
		expect(sanitized?.glass).toBe(0.01);
		expect(sanitized?.people).toBe(1);
		expect(sanitized?.ingredients).toEqual([
			{ kind: 'custom', name: 'Viina', volume: 1, abv: 100, price: 0, count: 1 }
		]);
	});
});

describe('scalePunch', () => {
	it('scales to quarter packages', () => {
		const recipe: PunchRecipe = {
			name: '',
			description: '',
			glass: 0.2,
			people: 1,
			ingredients: [{ kind: 'alko', id: '1', count: 3 }]
		};
		scalePunch(recipe, 0.5);
		expect(recipe.ingredients[0].count).toBe(1.5);
	});
});

describe('cheaperAlternative', () => {
	const current = product('1', { price: 12, volume: 0.75, abv: 12 });
	const products = [
		current,
		product('2', { price: 8, volume: 0.75, abv: 11.5 }),
		product('3', { price: 6, volume: 0.75, abv: 12, subType: 'valkoviinit' }),
		product('4', { price: 5, volume: 0.75, abv: 12, removed: true }),
		product('5', { price: 7, volume: 0.75, abv: 8 }),
		// The cheapest per litre, but one box is four bottles
		product('6', { price: 20, volume: 3, abv: 12 })
	];

	it('suggests the cheapest similar product', () => {
		const swap = cheaperAlternative(current, 2, products);
		expect(swap?.product[AllColumns.Number]).toBe('2');
		expect(swap?.count).toBe(2);
		expect(swap?.saving).toBeCloseTo(8);
	});

	it('swaps bottles for a box when the amount matches', () => {
		const swap = cheaperAlternative(current, 4, products);
		expect(swap?.product[AllColumns.Number]).toBe('6');
		expect(swap?.count).toBe(1);
		expect(swap?.saving).toBeCloseTo(28);
	});

	it('only considers available products when asked', () => {
		const swap = cheaperAlternative(
			current,
			2,
			products,
			(item) => item[AllColumns.Number] !== '2'
		);
		expect(swap).toBeNull();
	});
});

describe('cheaperAlternative for ciders', () => {
	const cider = (id: string, price: number, notes: string[]) =>
		product(id, { price, volume: 0.5, abv: 7, type: 'Panimotuotteet', subType: 'siiderit', notes });
	const current = cider('1', 4.4, ['Keltainen', ' kuiva', ' hapokas', ' keltaomenainen']);

	it('keeps to the same fruit', () => {
		const pear = cider('2', 3.99, ['Vaalea', ' kuiva', ' päärynäinen', ' omenainen']);
		expect(cheaperAlternative(current, 4, [current, pear])).toBeNull();
	});

	it('keeps to about the same sweetness', () => {
		const sweet = cider('2', 3.5, ['Vaalea', ' makea', ' omenainen']);
		expect(cheaperAlternative(current, 4, [current, sweet])).toBeNull();
	});

	it('suggests a similar cider', () => {
		const apple = cider('2', 3.5, ['Vaalea', ' puolikuiva', ' kypsän omenainen']);
		expect(cheaperAlternative(current, 4, [current, apple])?.product[AllColumns.Number]).toBe('2');
	});
});

describe('templates', () => {
	const products = [
		product('1', { price: 12, volume: 0.75, abv: 12 }),
		product('2', { price: 9, volume: 0.75, abv: 11 }),
		product('3', { price: 5, volume: 0.75, abv: 5 }),
		product('4', { price: 6, volume: 0.375, abv: 12 })
	];
	const pick = {
		type: 'Viinit',
		subTypes: ['Kuohuviinit ja samppanjat'],
		sizes: [0.75],
		minAbv: 10,
		label: 'Kuohuviini'
	};

	it('picks the cheapest serving that fits', () => {
		expect(pickProduct(pick, products)?.[AllColumns.Number]).toBe('2');
	});

	it('prefers products in the store', () => {
		const inStore = (item: PriceListItem) => item[AllColumns.Number] === '1';
		expect(pickProduct(pick, products, inStore)?.[AllColumns.Number]).toBe('1');
		expect(pickProduct(pick, products, () => false)?.[AllColumns.Number]).toBe('2');
	});

	it('leaves out ingredients with no product', () => {
		const recipe = resolveTemplate(
			{
				id: 't',
				name: 'Testi',
				description: '',
				glass: 0.2,
				ingredients: [
					{ pick, count: 3 },
					{ pick: { ...pick, type: 'Väkevät' }, count: 1 },
					{ kind: 'custom', name: 'Limu', volume: 1.5, abv: 0, price: 2, count: 1 }
				]
			},
			products
		);
		expect(recipe.ingredients).toEqual([
			{ kind: 'alko', id: '2', count: 3 },
			{ kind: 'custom', name: 'Limu', volume: 1.5, abv: 0, price: 2, count: 1 }
		]);
	});
});

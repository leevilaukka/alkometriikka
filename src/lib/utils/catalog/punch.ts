// The punch calculator ("boolilaskuri"): mixing Alko products and other ingredients into one bowl.
// Kept free of `$lib` state imports so it can be unit tested.
import type { GenderOptions, PriceListItem } from '$lib/types';
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import { GenderOptionsMap } from '../constants/app';
import { AllColumns } from '../constants/columns';
import { calculateDrunkValue, ETHANOL_DENSITY, SERVING_GRAMS } from './alko';

export type AlkoIngredient = { kind: 'alko'; id: string; count: number };

/** Anything not from Alko: juice, soda, ice, or a drink bought elsewhere */
export type CustomIngredient = {
	kind: 'custom';
	name: string;
	/** Package size in litres */
	volume: number;
	/** Alcohol, % by volume */
	abv: number;
	/** Price of one package in euros */
	price: number;
	count: number;
};

export type PunchIngredient = AlkoIngredient | CustomIngredient;

export type PunchRecipe = {
	name: string;
	/** Glass size in litres */
	glass: number;
	people: number;
	ingredients: PunchIngredient[];
};

export type SavedPunch = PunchRecipe & { id: string; savedAt: string };

export const DEFAULT_GLASS = 0.2;

export function emptyPunch(): PunchRecipe {
	return { name: '', glass: DEFAULT_GLASS, people: 1, ingredients: [] };
}

/** Limits that keep a typo or a hand-edited link from producing nonsense */
const LIMITS = {
	count: 1000,
	volume: 100,
	abv: 100,
	price: 10_000,
	glass: [0.01, 2],
	people: [1, 500],
	ingredients: 50,
	name: 80
} as const;

const clamp = (value: unknown, min: number, max: number, fallback = min) => {
	const number = typeof value === 'number' ? value : Number(value);
	return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
};

const text = (value: unknown, max: number = LIMITS.name) =>
	typeof value === 'string' ? value.slice(0, max) : '';

function sanitizeIngredient(value: unknown): PunchIngredient | null {
	const ingredient = value as
		| (Partial<Omit<AlkoIngredient, 'kind'> & Omit<CustomIngredient, 'kind'>> & { kind?: unknown })
		| null;
	if (!ingredient || typeof ingredient !== 'object') return null;
	const count = clamp(ingredient.count, 0, LIMITS.count, 1);
	if (ingredient.kind === 'alko') {
		const id = text(ingredient.id, 20);
		return /^\d+$/.test(id) ? { kind: 'alko', id, count } : null;
	}
	if (ingredient.kind !== 'custom') return null;
	return {
		kind: 'custom',
		name: text(ingredient.name),
		volume: clamp(ingredient.volume, 0, LIMITS.volume, 0),
		abv: clamp(ingredient.abv, 0, LIMITS.abv, 0),
		price: clamp(ingredient.price, 0, LIMITS.price, 0),
		count
	};
}

/** A recipe from storage or a link, with every value checked; null when it isn't one */
export function sanitizePunch(value: unknown): PunchRecipe | null {
	const recipe = value as Partial<PunchRecipe> | null;
	if (!recipe || typeof recipe !== 'object' || !Array.isArray(recipe.ingredients)) return null;
	return {
		name: text(recipe.name),
		glass: clamp(recipe.glass, LIMITS.glass[0], LIMITS.glass[1], DEFAULT_GLASS),
		people: Math.round(clamp(recipe.people, LIMITS.people[0], LIMITS.people[1], 1)),
		ingredients: recipe.ingredients
			.slice(0, LIMITS.ingredients)
			.map(sanitizeIngredient)
			.filter((ingredient) => ingredient !== null)
	};
}

// Shared links use arrays instead of objects, which keeps them about half as long
type EncodedIngredient =
	| [id: string, count: number]
	| [name: string, volume: number, abv: number, price: number, count: number];
type EncodedPunch = [version: 1, name: string, glass: number, people: number, EncodedIngredient[]];

export function encodePunch(recipe: PunchRecipe): string {
	const encoded: EncodedPunch = [
		1,
		recipe.name,
		recipe.glass,
		recipe.people,
		recipe.ingredients.map((ingredient) =>
			ingredient.kind === 'alko'
				? [ingredient.id, ingredient.count]
				: [ingredient.name, ingredient.volume, ingredient.abv, ingredient.price, ingredient.count]
		)
	];
	return compressToEncodedURIComponent(JSON.stringify(encoded));
}

export function decodePunch(value: string): PunchRecipe | null {
	try {
		const decoded = JSON.parse(decompressFromEncodedURIComponent(value) ?? '') as unknown;
		if (!Array.isArray(decoded) || decoded[0] !== 1 || !Array.isArray(decoded[4])) return null;
		const [, name, glass, people, items] = decoded as EncodedPunch;
		return sanitizePunch({
			name,
			glass,
			people,
			ingredients: items.map((item) =>
				Array.isArray(item) && item.length === 2
					? { kind: 'alko', id: String(item[0]), count: item[1] }
					: Array.isArray(item)
						? {
								kind: 'custom',
								name: item[0],
								volume: item[1],
								abv: item[2],
								price: item[3],
								count: item[4]
							}
						: null
			)
		});
	} catch {
		return null;
	}
}

/** One ingredient as the calculation sees it, Alko's or the user's own */
export type PunchLine = {
	name: string;
	volume: number;
	abv: number;
	price: number;
	count: number;
	/** For Alko ingredients that are in the price list */
	product?: PriceListItem;
	/** An Alko ingredient whose product isn't in the price list */
	missing?: boolean;
};

const finite = (value: unknown) => {
	const number = Number(value);
	return Number.isFinite(number) && number > 0 ? number : 0;
};

export function punchLines(
	ingredients: PunchIngredient[],
	findProduct: (id: string) => PriceListItem | undefined
): PunchLine[] {
	return ingredients.map((ingredient) => {
		if (ingredient.kind === 'custom') {
			return {
				name: ingredient.name,
				volume: finite(ingredient.volume),
				abv: Math.min(100, finite(ingredient.abv)),
				price: finite(ingredient.price),
				count: finite(ingredient.count)
			};
		}
		const product = findProduct(ingredient.id);
		if (!product) {
			return {
				name: `Tuote ${ingredient.id}`,
				volume: 0,
				abv: 0,
				price: 0,
				count: 0,
				missing: true
			};
		}
		return {
			name: product[AllColumns.Name],
			volume: finite(product[AllColumns.BottleSize]),
			abv: finite(product[AllColumns.AlcoholPercentage]),
			price: finite(product[AllColumns.Price]),
			count: finite(ingredient.count),
			product
		};
	});
}

export type PunchAmounts = {
	/** Litres */
	volume: number;
	grams: number;
	servings: number;
	price: number;
	/** Estimated blood alcohol in ‰ if drunk at once, without elimination */
	promille: number;
};

export type PunchTotals = PunchAmounts & {
	/** Litres of pure alcohol */
	alcohol: number;
	/** Litres of the ingredients that contain alcohol, i.e. the volume without mixers */
	alcoholicVolume: number;
	abv: number;
	/** Null without anything to divide by, e.g. an alcohol-free punch */
	euroPerServing: number | null;
	euroPerLitre: number | null;
	gramsPerEuro: number | null;
	glasses: number;
	perGlass: PunchAmounts;
	perPerson: PunchAmounts & { glasses: number };
	/** Each line's share of the totals, in the order of the lines */
	lines: { volume: number; alcohol: number; price: number }[];
};

export function computePunch(
	lines: PunchLine[],
	options: {
		glass: number;
		people: number;
		gender?: GenderOptions | null;
		weight?: number | null;
	}
): PunchTotals {
	const lineTotals = lines.map((line) => ({
		volume: line.volume * line.count,
		alcohol: line.volume * line.count * (line.abv / 100),
		price: line.price * line.count
	}));
	const volume = lineTotals.reduce((sum, line) => sum + line.volume, 0);
	const alcohol = lineTotals.reduce((sum, line) => sum + line.alcohol, 0);
	const price = lineTotals.reduce((sum, line) => sum + line.price, 0);
	const alcoholicVolume = lineTotals.reduce(
		(sum, line) => (line.alcohol > 0 ? sum + line.volume : sum),
		0
	);
	const grams = alcohol * ETHANOL_DENSITY;
	const servings = grams / SERVING_GRAMS;
	const abv = volume > 0 ? (alcohol / volume) * 100 : 0;

	// The same Widmark estimate as the product pages, for the whole bowl at once
	const promille =
		grams > 0
			? calculateDrunkValue(
					volume,
					abv,
					price,
					options.gender ?? GenderOptionsMap.Unspecified,
					options.weight ?? undefined
				)[AllColumns.EstimatedPromille]
			: 0;

	const total: PunchAmounts = { volume, grams, servings, price, promille };
	const scale = (factor: number): PunchAmounts => ({
		volume: volume * factor,
		grams: grams * factor,
		servings: servings * factor,
		price: price * factor,
		promille: promille * factor
	});

	const glass = finite(options.glass) || DEFAULT_GLASS;
	const people = Math.max(1, Math.round(finite(options.people) || 1));
	const glasses = volume / glass;

	return {
		...total,
		alcohol,
		alcoholicVolume,
		abv,
		euroPerServing: servings > 0 && price > 0 ? price / servings : null,
		euroPerLitre: volume > 0 && price > 0 ? price / volume : null,
		gramsPerEuro: price > 0 && grams > 0 ? grams / price : null,
		glasses,
		perGlass: volume > 0 ? scale(glass / volume) : scale(0),
		perPerson: { ...scale(1 / people), glasses: glasses / people },
		lines: lineTotals
	};
}

/**
 * Litres of an alcohol-free mixer that bring the punch down to `target` % alcohol, 0 when it is
 * that mild already (or has no alcohol), null for a target that can't be reached by diluting.
 */
export function mixerForTarget(totals: Pick<PunchTotals, 'alcohol' | 'volume'>, target: number) {
	if (!(target > 0) || target >= 100) return null;
	if (totals.alcohol <= 0) return 0;
	return Math.max(0, totals.alcohol / (target / 100) - totals.volume);
}

/** Scales every ingredient in place, e.g. ×2 for twice as many guests */
export function scalePunch(recipe: PunchRecipe, factor: number) {
	for (const ingredient of recipe.ingredients) {
		// Halving three bottles gives 1.5; a quarter of a bottle is about as fine as it's worth going
		ingredient.count = Math.round((ingredient.count || 0) * factor * 4) / 4;
	}
}

const isActive = (product: PriceListItem) =>
	product[AllColumns.RemovedFromSelection] !== true && finite(product[AllColumns.Price]) > 0;

/** Cost of the same alcohol in another product, per package, for comparing swaps */
const pricePerLitre = (product: PriceListItem) =>
	finite(product[AllColumns.Price]) / (finite(product[AllColumns.BottleSize]) || Infinity);

export type PunchSwap = { product: PriceListItem; count: number; saving: number };

/** Smallest saving worth suggesting a swap for */
const MIN_SAVING = 0.5;

/**
 * The cheapest active product of the same kind (same type, subtype and beer style, alcohol within
 * a percentage point) that replaces `count` packages of `product` with about the same amount in
 * whole packages, or null when none saves at least 50 cents. With `available`, only products it
 * accepts are considered, e.g. those in the preferred store.
 */
export function cheaperAlternative(
	product: PriceListItem,
	count: number,
	products: PriceListItem[],
	available?: (product: PriceListItem) => boolean
): PunchSwap | null {
	const used = finite(product[AllColumns.BottleSize]) * count;
	const abv = finite(product[AllColumns.AlcoholPercentage]);
	const cost = finite(product[AllColumns.Price]) * count;
	if (!(used > 0) || !(abv > 0)) return null;

	let best: PunchSwap | null = null;
	for (const candidate of products) {
		if (candidate === product || !isActive(candidate)) continue;
		if (candidate[AllColumns.Type] !== product[AllColumns.Type]) continue;
		if (candidate[AllColumns.SubType] !== product[AllColumns.SubType]) continue;
		if ((candidate[AllColumns.BeerType] || '') !== (product[AllColumns.BeerType] || '')) continue;
		if (Math.abs(finite(candidate[AllColumns.AlcoholPercentage]) - abv) > 1) continue;
		if (pricePerLitre(candidate) >= pricePerLitre(product)) continue;
		if (available && !available(candidate)) continue;

		const size = finite(candidate[AllColumns.BottleSize]);
		const candidateCount = Math.max(1, Math.round(used / size));
		// About the same amount, so a 3 l box doesn't stand in for one bottle
		const ratio = (candidateCount * size) / used;
		if (ratio < 0.85 || ratio > 1.2) continue;

		const saving = cost - candidateCount * finite(candidate[AllColumns.Price]);
		if (saving >= MIN_SAVING && (!best || saving > best.saving)) {
			best = { product: candidate, count: candidateCount, saving };
		}
	}
	return best;
}

/** Which Alko products a template ingredient may be */
export type ProductPick = {
	type: string;
	subTypes: string[];
	sizes: number[];
	minAbv?: number;
	/** What the user sees for this ingredient before it's resolved, e.g. "Kuohuviini" */
	label: string;
};

export type PunchTemplate = {
	id: string;
	name: string;
	description: string;
	glass: number;
	ingredients: ({ pick: ProductPick; count: number } | CustomIngredient)[];
};

/**
 * Grocery-store ingredients. The prices are rough guesses for a Finnish supermarket, there to
 * edit; Alko doesn't sell most of these.
 */
export const PUNCH_MIXERS: CustomIngredient[] = [
	{ kind: 'custom', name: 'Sitruunalimu', volume: 1.5, abv: 0, price: 1.89, count: 1 },
	{ kind: 'custom', name: 'Appelsiinimehu', volume: 1, abv: 0, price: 1.99, count: 1 },
	{ kind: 'custom', name: 'Omenamehu', volume: 1, abv: 0, price: 1.79, count: 1 },
	{ kind: 'custom', name: 'Kivennäisvesi', volume: 1.5, abv: 0, price: 0.99, count: 1 },
	{ kind: 'custom', name: 'Jää (1 kg)', volume: 1, abv: 0, price: 1.99, count: 1 },
	{ kind: 'custom', name: 'Hedelmät ja marjat', volume: 0, abv: 0, price: 3.5, count: 1 }
];

const mixer = (name: string, count = 1): CustomIngredient => ({
	...PUNCH_MIXERS.find((item) => item.name === name)!,
	count
});

export const PUNCH_TEMPLATES: PunchTemplate[] = [
	{
		id: 'kuohuviini',
		name: 'Kuohuviinibooli',
		description: 'Kuohuviiniä, limua ja mehua. Juhlien klassikko.',
		glass: 0.2,
		ingredients: [
			{
				pick: {
					type: 'Viinit',
					subTypes: ['kuohuviinit ja samppanjat'],
					sizes: [0.75],
					minAbv: 10,
					label: 'Kuohuviini'
				},
				count: 3
			},
			mixer('Sitruunalimu'),
			mixer('Appelsiinimehu'),
			mixer('Jää (1 kg)'),
			mixer('Hedelmät ja marjat')
		]
	},
	{
		id: 'sangria',
		name: 'Sangria',
		description: 'Hanapakkaus punaviiniä, mehua ja limua.',
		glass: 0.2,
		ingredients: [
			{
				pick: {
					type: 'Viinit',
					subTypes: ['punaviinit'],
					sizes: [3],
					minAbv: 11,
					label: 'Punaviini'
				},
				count: 1
			},
			mixer('Appelsiinimehu'),
			mixer('Sitruunalimu', 2),
			mixer('Jää (1 kg)'),
			mixer('Hedelmät ja marjat')
		]
	},
	{
		id: 'viina',
		name: 'Viinabooli',
		description: 'Pullo vodkaa tai viinaa ja kolme litraa limua.',
		glass: 0.2,
		ingredients: [
			{
				pick: {
					type: 'Väkevät',
					subTypes: ['vodka', 'viina'],
					sizes: [0.7],
					minAbv: 37.5,
					label: 'Vodka tai viina'
				},
				count: 1
			},
			mixer('Sitruunalimu', 2),
			mixer('Appelsiinimehu'),
			mixer('Jää (1 kg)')
		]
	},
	{
		id: 'siideri',
		name: 'Siideribooli',
		description: 'Siideriä, lonkeroa ja omenamehua. Mieto ja helppo.',
		glass: 0.25,
		ingredients: [
			{
				pick: {
					type: 'Panimotuotteet',
					subTypes: ['siiderit'],
					sizes: [0.33],
					minAbv: 4,
					label: 'Siideri'
				},
				count: 6
			},
			{
				pick: {
					type: 'Panimotuotteet',
					subTypes: ['juomasekoitukset'],
					sizes: [0.33],
					minAbv: 4,
					label: 'Lonkero'
				},
				count: 6
			},
			mixer('Omenamehu'),
			mixer('Jää (1 kg)')
		]
	},
	{
		id: 'glogi',
		name: 'Glögibooli',
		description: 'Lämmin glögi rommilla ja omenamehulla. Pienemmät mukit.',
		glass: 0.1,
		ingredients: [
			{
				pick: { type: 'Viinit', subTypes: ['glögit'], sizes: [0.75], minAbv: 8, label: 'Glögi' },
				count: 2
			},
			{
				pick: {
					type: 'Väkevät',
					subTypes: ['rommit'],
					sizes: [0.5, 0.7],
					minAbv: 37.5,
					label: 'Rommi'
				},
				count: 1
			},
			mixer('Omenamehu')
		]
	}
];

/**
 * The product a template ingredient stands for: the active one with the cheapest serving. Among
 * the products `available` accepts when it accepts any, so the template can be bought in one store.
 */
export function pickProduct(
	pick: ProductPick,
	products: PriceListItem[],
	available?: (product: PriceListItem) => boolean
): PriceListItem | undefined {
	const subTypes = new Set(pick.subTypes.map((subType) => subType.toLocaleLowerCase('fi')));
	const matches = products.filter(
		(product) =>
			isActive(product) &&
			product[AllColumns.Type] === pick.type &&
			subTypes.has(String(product[AllColumns.SubType]).toLocaleLowerCase('fi')) &&
			pick.sizes.includes(product[AllColumns.BottleSize]) &&
			finite(product[AllColumns.AlcoholPercentage]) >= (pick.minAbv ?? 0) &&
			finite(product[AllColumns.EuroPerServing]) > 0
	);
	const inStore = available ? matches.filter(available) : [];
	const pool = inStore.length ? inStore : matches;
	let best: PriceListItem | undefined;
	for (const product of pool) {
		if (!best || product[AllColumns.EuroPerServing] < best[AllColumns.EuroPerServing])
			best = product;
	}
	return best;
}

export function resolveTemplate(
	template: PunchTemplate,
	products: PriceListItem[],
	available?: (product: PriceListItem) => boolean
): PunchRecipe {
	const ingredients: PunchIngredient[] = [];
	for (const ingredient of template.ingredients) {
		if (!('pick' in ingredient)) {
			ingredients.push({ ...ingredient });
			continue;
		}
		const product = pickProduct(ingredient.pick, products, available);
		if (product)
			ingredients.push({ kind: 'alko', id: product[AllColumns.Number], count: ingredient.count });
	}
	return { name: template.name, glass: template.glass, people: 1, ingredients };
}

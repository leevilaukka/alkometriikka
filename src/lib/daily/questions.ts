import { AllColumns } from '$lib/utils/constants';
import type { PriceListItem } from '$lib/types';
import { shuffle } from './rng';
import type { DailyProduct } from './manifest';

export type ProductId = string;
export const DAILY_QUESTION_COUNT = 7;
/**
 * Bump whenever the generated game changes for the same seed + pool (this
 * file, rng.ts, the pool/trim logic in manifest.ts). The pinned-manifest test
 * fails when you forget. A bump is not free:
 * - the baker re-bakes today's manifest, so the live game changes mid-day;
 * - every player's saved progress for today is discarded (loadSavedGame);
 * - finished days not yet archived are skipped forever (bakeArchive only
 *   archives current-version manifests), so deploy after the 00:15 archive run;
 * - until fetchData re-bakes (right after the build), clients reject the old
 *   manifests and show an error.
 */
export const DAILY_GAME_VERSION = 7;

export type PriceQuestion = {
	type: 'price';
	productId: ProductId;
	options: number[];
	correctPrice: number;
};
export type ComparisonQuestion = {
	type: 'cheaper';
	productIds: [ProductId, ProductId];
	correctProductId: ProductId;
};
export type EfficiencyQuestion = {
	type: 'efficiency';
	productIds: [ProductId, ProductId];
	correctProductId: ProductId;
	efficiency: Record<ProductId, number>;
};
export type EstimateQuestion = {
	type: 'estimate';
	productId: ProductId;
	volume: number;
	alcoholPercentage: number;
	correctPrice: number;
};
export type AttributeMetric = 'alcohol' | 'volume' | 'literPrice' | 'sugar' | 'energy';
export type AttributeQuestion = {
	type: 'attribute';
	metric: AttributeMetric;
	productIds: [ProductId, ProductId];
	correctProductId: ProductId;
	values: Record<ProductId, number>;
};
export type ChoiceField = 'country' | 'manufacturer' | 'category';
export type ChoiceQuestion = {
	type: 'choice';
	field: ChoiceField;
	productId: ProductId;
	options: string[];
	correctValue: string;
};
export type Question =
	| PriceQuestion
	| ComparisonQuestion
	| EfficiencyQuestion
	| EstimateQuestion
	| AttributeQuestion
	| ChoiceQuestion;
export type GeneratedGame = {
	version: typeof DAILY_GAME_VERSION;
	date: string;
	questions: Question[];
};
export type SavedDailyGame = {
	date: string;
	game: GeneratedGame;
	/** The manifest's frozen pool, so display data never depends on the live catalog. */
	products?: DailyProduct[];
	completed?: boolean;
	score?: number;
	correct?: number;
	currentIndex?: number;
	points?: number[];
	correctAnswers?: boolean[];
	selectedAnswer?: string | number | null;
	answered?: boolean;
	answerPoints?: number;
};
export type DailyStreak = { current: number; best: number; completedDate?: string };
/**
 * Per-date result kept in localStorage so the archive can show past scores.
 * `live` marks a result earned on the day itself (via the Daily page); those
 * days are shown read-only in the archive and cannot be replayed.
 */
export type ArchivedScore = { score: number; correct: number };
export type ArchivedScores = Record<string, ArchivedScore>;
/** In-progress or completed play of an archived (past) day, persisted safely. */
export type ArchiveRunState = {
	date: string;
	currentIndex: number;
	points: number[];
	correctAnswers: boolean[];
	/** The value picked for each answered question, kept after completion for the "correct answers" review. */
	answers: (string | number)[];
	selectedAnswer: string | number | null;
	answered: boolean;
	answerPoints: number;
	completed?: boolean;
	score?: number;
	correct?: number;
};
export type ArchiveRuns = Record<string, ArchiveRunState>;
export type UnlimitedRunState = {
	game: GeneratedGame;
	currentIndex: number;
	selectedAnswer: string | number | null;
	answered: boolean;
	answerPoints: number;
	points: number[];
	correctAnswers: boolean[];
	completed?: boolean;
	score?: number;
	correct?: number;
};

type ValidProduct = PriceListItem & {
	[AllColumns.Number]: string;
	[AllColumns.Name]: string;
	[AllColumns.Price]: number;
};

function positiveNumber(value: unknown): number | null {
	if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
	if (typeof value !== 'string') return null;
	const parsed = Number(value.replace(',', '.').replace(/[^\d.-]/g, ''));
	return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function productId(product: PriceListItem): string | null {
	const id = product[AllColumns.Number];
	return typeof id === 'string' && id.trim() ? id : null;
}

export function getValidProducts(products: readonly PriceListItem[]): ValidProduct[] {
	const seen = new Set<string>();
	return products
		.filter((product): product is ValidProduct => {
			const id = productId(product);
			const name = product[AllColumns.Name];
			const price = positiveNumber(product[AllColumns.Price]);
			if (!id || seen.has(id) || typeof name !== 'string' || !name.trim() || price == null)
				return false;
			seen.add(id);
			return true;
		})
		.map((product) => ({
			...product,
			[AllColumns.Price]: positiveNumber(product[AllColumns.Price])!
		}));
}

function getVolume(product: PriceListItem): number | null {
	return positiveNumber(product[AllColumns.BottleSize]);
}

function getAlcoholPercentage(product: PriceListItem): number | null {
	const value = positiveNumber(product[AllColumns.AlcoholPercentage]);
	return value != null && value <= 100 ? value : null;
}

function pureAlcoholPerEuro(product: PriceListItem): number | null {
	const derived = positiveNumber(product[AllColumns.AlcoholGramsPerEuro]);
	if (derived != null) return derived;
	const volume = getVolume(product);
	const alcoholPercentage = getAlcoholPercentage(product);
	const price = positiveNumber(product[AllColumns.Price]);
	if (volume == null || alcoholPercentage == null || price == null) return null;
	const result = (volume * alcoholPercentage * 10) / price;
	return Number.isFinite(result) && result > 0 ? result : null;
}

function uniquePrices(
	correctPrice: number,
	products: readonly ValidProduct[],
	random: () => number
): number[] {
	const nearby = shuffle(
		products.map((product) => product[AllColumns.Price]).filter((price) => price !== correctPrice),
		random
	);
	// Dedupe after shuffling (not before) so RNG consumption — and therefore
	// every already-baked game without duplicate prices — stays unchanged.
	const options = [...new Set([correctPrice, ...nearby])];
	for (const offset of [0.5, 1, 2, 5]) {
		if (options.length >= 4) break;
		const candidate = Number(
			Math.max(0.01, correctPrice + (random() > 0.5 ? offset : -offset)).toFixed(2)
		);
		if (!options.includes(candidate)) options.push(candidate);
	}
	return options.slice(0, 4);
}

function textValue(product: PriceListItem, column: string): string | null {
	const value = product[column];
	return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function attributeValue(product: PriceListItem, metric: AttributeMetric): number | null {
	if (metric === 'alcohol') return getAlcoholPercentage(product);
	if (metric === 'volume') return getVolume(product);
	if (metric === 'literPrice') return positiveNumber(product[AllColumns.PricePerLiter]);
	if (metric === 'sugar') return positiveNumber(product[AllColumns.Sugar]);
	if (metric === 'energy') return positiveNumber(product[AllColumns.Energy]);
	return null;
}

export function generateDailyGame(
	date: string,
	products: readonly PriceListItem[],
	random: () => number
): GeneratedGame {
	const validProducts = getValidProducts(products);
	const questions: Question[] = [];
	const efficiencyProducts = validProducts.filter((product) => pureAlcoholPerEuro(product) != null);
	const estimateProducts = validProducts.filter(
		(product) => getVolume(product) != null && getAlcoholPercentage(product) != null
	);
	const usedProducts = new Set<string>();

	const weightedPick = (pool: readonly ValidProduct[]) => {
		const totalWeight = pool.reduce(
			(total, product) =>
				total + (String(product[AllColumns.New]).toLowerCase() === 'uutuus' ? 3 : 1),
			0
		);
		let cursor = random() * totalWeight;
		for (const product of pool) {
			cursor -= String(product[AllColumns.New]).toLowerCase() === 'uutuus' ? 3 : 1;
			if (cursor < 0) return product;
		}
		return pool[pool.length - 1];
	};
	const pickProduct = (pool: readonly ValidProduct[]) => {
		const available = pool.filter((product) => !usedProducts.has(productId(product)!));
		return weightedPick(available.length ? available : pool);
	};
	const pickPair = (pool: readonly ValidProduct[]) => {
		if (pool.length < 2) return null;
		const first = pickProduct(pool);
		const secondPool = pool.filter((product) => product !== first);
		return [first, pickProduct(secondPool)] as const;
	};
	const remember = (...selected: ValidProduct[]) =>
		selected.forEach((product) => usedProducts.add(productId(product)!));

	const addPrice = () => {
		if (!validProducts.length) return false;
		const product = pickProduct(validProducts);
		remember(product);
		questions.push({
			type: 'price',
			productId: productId(product)!,
			options: uniquePrices(product[AllColumns.Price], validProducts, random),
			correctPrice: product[AllColumns.Price]
		});
		return true;
	};
	const addComparison = () => {
		const pair = pickPair(validProducts);
		if (!pair) return false;
		const [first, second] = pair;
		if (first[AllColumns.Price] === second[AllColumns.Price]) return false;
		remember(first, second);
		questions.push({
			type: 'cheaper',
			productIds: [productId(first)!, productId(second)!],
			correctProductId:
				first[AllColumns.Price] <= second[AllColumns.Price] ? productId(first)! : productId(second)!
		});
		return true;
	};
	const addEfficiency = () => {
		const pair = pickPair(efficiencyProducts);
		if (!pair) return false;
		const [first, second] = pair;
		const firstEfficiency = pureAlcoholPerEuro(first)!;
		const secondEfficiency = pureAlcoholPerEuro(second)!;
		if (firstEfficiency === secondEfficiency) return false;
		remember(first, second);
		questions.push({
			type: 'efficiency',
			productIds: [productId(first)!, productId(second)!],
			correctProductId:
				firstEfficiency >= secondEfficiency ? productId(first)! : productId(second)!,
			efficiency: { [productId(first)!]: firstEfficiency, [productId(second)!]: secondEfficiency }
		});
		return true;
	};
	const addEstimate = () => {
		const product = estimateProducts.length ? pickProduct(estimateProducts) : null;
		const volume = product && getVolume(product);
		const alcoholPercentage = product && getAlcoholPercentage(product);
		if (!product || volume == null || alcoholPercentage == null) return false;
		remember(product);
		questions.push({
			type: 'estimate',
			productId: productId(product)!,
			volume,
			alcoholPercentage,
			correctPrice: product[AllColumns.Price]
		});
		return true;
	};
	const addAttribute = (metric: AttributeMetric) => {
		const candidates = validProducts.filter((product) => attributeValue(product, metric) != null);
		const pair = pickPair(candidates);
		if (!pair) return false;
		const [first, second] = pair;
		const firstValue = attributeValue(first, metric)!;
		const secondValue = attributeValue(second, metric)!;
		if (firstValue === secondValue) return false;
		remember(first, second);
		questions.push({
			type: 'attribute',
			metric,
			productIds: [productId(first)!, productId(second)!],
			correctProductId: (
				metric === 'literPrice' ? firstValue <= secondValue : firstValue >= secondValue
			)
				? productId(first)!
				: productId(second)!,
			values: { [productId(first)!]: firstValue, [productId(second)!]: secondValue }
		});
		return true;
	};
	const addChoice = (field: ChoiceField) => {
		const column =
			field === 'country'
				? AllColumns.Country
				: field === 'manufacturer'
					? AllColumns.Manufacturer
					: AllColumns.Type;
		const candidates = validProducts.filter((product) => textValue(product, column));
		if (!candidates.length) return false;
		const product = pickProduct(candidates);
		const correctValue = textValue(product, column)!;
		const allValues = [
			...new Set(
				candidates
					.map((item) => textValue(item, column))
					.filter((value): value is string => Boolean(value))
			)
		];
		const options = [correctValue, ...allValues.filter((value) => value !== correctValue)];
		if (options.length < 2) return false;
		remember(product);
		questions.push({
			type: 'choice',
			field,
			productId: productId(product)!,
			options: shuffle(options.slice(0, 4), random),
			correctValue
		});
		return true;
	};
	const generators: (() => boolean)[] = [
		addPrice,
		addComparison,
		addEfficiency,
		addEstimate,
		() => addAttribute('alcohol'),
		() => addAttribute('volume'),
		() => addAttribute('literPrice'),
		() => addAttribute('sugar'),
		() => addAttribute('energy'),
		() => addChoice('country'),
		() => addChoice('manufacturer'),
		() => addChoice('category')
	];
	for (const generator of shuffle(generators, random)) {
		if (questions.length >= DAILY_QUESTION_COUNT) break;
		generator();
	}
	while (questions.length < DAILY_QUESTION_COUNT && validProducts.length) addPrice();

	return { version: DAILY_GAME_VERSION, date, questions };
}

export function productForQuestion(
	question: Question,
	products: readonly PriceListItem[],
	id: string
) {
	return products.find((product) => product[AllColumns.Number] === id);
}

export { pureAlcoholPerEuro };

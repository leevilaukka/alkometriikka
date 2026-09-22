import { AllColumns } from '$lib/utils/constants';
import type { PriceListItem } from '$lib/types';
import { createRng, shuffle } from './rng';
import {
	DAILY_GAME_VERSION,
	DAILY_QUESTION_COUNT,
	generateDailyGame,
	getValidProducts,
	type GeneratedGame,
	type Question
} from './questions';

/**
 * Size of the frozen product pool that a day's daily game is drawn from.
 *
 * The pool is what the client regenerates questions from, so it must be small
 * enough to ship in the daily file but varied enough that every question type
 * (price, comparison, efficiency, estimate, attribute, choice) can be built.
 * 24 products from the real catalog offer realistic price distractors and
 * plenty of distinct countries, manufacturers and categories for the choice
 * questions.
 */
export const DAILY_POOL_SIZE = 24;

/** Seeds the pool selection RNG. `attempt` lets the baker retry with a fresh pool. */
const DAILY_POOL_SEED_PREFIX = 'alkometriikka-daily-pool-v1';
const DAILY_POOL_MAX_ATTEMPTS = 8;

/**
 * A day's game must never collapse into a handful of repeated question types.
 * Attribute metrics (`alcohol`, `volume`, …) and choice fields (`country`,
 * `manufacturer`, …) are counted separately, so this is about the underlying
 * 12 builders rather than the 6 coarse question types.
 */
export const DAILY_MIN_VARIANTS = 5;

export function questionVariant(question: Question): string {
	return question.type === 'attribute'
		? `attribute:${question.metric}`
		: question.type === 'choice'
			? `choice:${question.field}`
			: question.type;
}

/**
 * The daily file no longer contains the game itself. It ships everything needed
 * to rebuild the exact game — a random seed and the frozen product pool — plus
 * a SHA-256 hash of the canonical game so a client can verify it rebuilt the
 * very game the pipeline baked, without the correct answers ever appearing in
 * the JSON.
 */
export type DailyProduct = {
	[AllColumns.Number]: string;
	[AllColumns.Name]: string;
	[AllColumns.Price]: number;
	[AllColumns.BottleSize]: number;
	[AllColumns.AlcoholPercentage]: number;
	[AllColumns.PricePerLiter]: number;
	[AllColumns.Sugar]: number;
	[AllColumns.Energy]: number;
	[AllColumns.Country]: string;
	[AllColumns.Manufacturer]: string;
	[AllColumns.Type]: string;
	[AllColumns.New]?: string;
	[AllColumns.PackagingType]: string;
};

export type DailyGameManifest = {
	version: typeof DAILY_GAME_VERSION;
	date: string;
	seed: string;
	gameHash: string;
	products: DailyProduct[];
};

function randomSeed(): string {
	const bytes = new Uint8Array(16);
	globalThis.crypto.getRandomValues(bytes);
	return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(value: string): Promise<string> {
	const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function trimProduct(product: PriceListItem): DailyProduct {
	return {
		[AllColumns.Number]: String(product[AllColumns.Number]),
		[AllColumns.Name]: String(product[AllColumns.Name]),
		[AllColumns.Price]: Number(product[AllColumns.Price]),
		[AllColumns.BottleSize]: Number(product[AllColumns.BottleSize]),
		[AllColumns.AlcoholPercentage]: Number(product[AllColumns.AlcoholPercentage]),
		[AllColumns.PricePerLiter]: Number(product[AllColumns.PricePerLiter]),
		[AllColumns.Sugar]: Number(product[AllColumns.Sugar]),
		[AllColumns.Energy]: Number(product[AllColumns.Energy]),
		[AllColumns.Country]: String(product[AllColumns.Country]),
		[AllColumns.Manufacturer]: String(product[AllColumns.Manufacturer]),
		[AllColumns.Type]: String(product[AllColumns.Type]),
		[AllColumns.New]: typeof product[AllColumns.New] === 'string' ? product[AllColumns.New] : '',
		[AllColumns.PackagingType]: String(product[AllColumns.PackagingType] ?? '')
	};
}

/**
 * Deterministically samples a frozen pool of {@link DAILY_POOL_SIZE} products
 * for the day. The pool is trimmed to the columns the daily generator reads,
 * then the game is generated from that trimmed pool — exactly the shape the
 * client will rebuild from later, so the two sides can never diverge.
 */
export async function generateDailyGameManifest(
	date: string,
	catalog: readonly PriceListItem[]
): Promise<DailyGameManifest> {
	const validProducts = getValidProducts(catalog);
	if (!validProducts.length) throw new Error('No valid products to build a daily pool from');
	const seed = randomSeed();

	let pool: DailyProduct[] = [];
	let game: GeneratedGame | null = null;
	for (let attempt = 0; attempt < DAILY_POOL_MAX_ATTEMPTS; attempt += 1) {
		pool = shuffle(validProducts, createRng(`${DAILY_POOL_SEED_PREFIX}-${date}-${seed}-${attempt}`))
			.slice(0, DAILY_POOL_SIZE)
			.map(trimProduct);
		if (pool.length < 2) throw new Error('Daily product pool too small to build a game');
		game = generateDailyGame(date, pool as unknown as PriceListItem[], createRng(seed));
		const distinctVariants = new Set(game.questions.map(questionVariant)).size;
		if (game.questions.length === DAILY_QUESTION_COUNT && distinctVariants >= DAILY_MIN_VARIANTS)
			break;
	}

	if (!game || game.questions.length < DAILY_QUESTION_COUNT) {
		throw new Error(`Could not build a ${DAILY_QUESTION_COUNT}-question daily game for ${date}`);
	}

	return {
		version: DAILY_GAME_VERSION,
		date,
		seed,
		gameHash: await sha256Hex(JSON.stringify(game)),
		products: pool
	};
}

/**
 * Rebuilds the day's game from a downloaded manifest. Returns `null` when the
 * pinned pool cannot produce a full game or when the rebuilt game does not hash
 * to the canonical game baked by the pipeline (tampered or stale file).
 */
export async function reconstructDailyGame(
	manifest: DailyGameManifest
): Promise<GeneratedGame | null> {
	const game = generateDailyGame(
		manifest.date,
		manifest.products as unknown as PriceListItem[],
		createRng(manifest.seed)
	);
	if (game.questions.length !== DAILY_QUESTION_COUNT) return null;
	if ((await sha256Hex(JSON.stringify(game))) !== manifest.gameHash) return null;
	return game;
}

/**
 * Once a day is over its answers are public, so the archive can ship the full
 * resolved game instead of the answer-free manifest. Doing this means old days
 * stay replayable even if the generator or the manifest format changes later —
 * the archive file is a self-contained, immutable historical record.
 *
 * Display data is embedded per product too (name, price, manufacturer, type,
 * packaging) so archived days render correctly even after a product has been
 * removed from the live catalog.
 */
export const ARCHIVE_INDEX_VERSION = 1;

export type ArchiveProduct = {
	[AllColumns.Number]: string;
	[AllColumns.Name]: string;
	[AllColumns.Price]: number;
	[AllColumns.Manufacturer]: string;
	[AllColumns.Type]: string;
	[AllColumns.PackagingType]: string;
};

export type ArchiveGame = {
	version: typeof DAILY_GAME_VERSION;
	date: string;
	game: GeneratedGame;
	products: ArchiveProduct[];
};

export type ArchiveIndex = {
	version: typeof ARCHIVE_INDEX_VERSION;
	dates: string[];
};

/** Unique product ids referenced by the questions, in game order. */
export function requiredProductIds(game: GeneratedGame): string[] {
	const ids = new Set<string>();
	for (const question of game.questions) {
		if (
			question.type === 'cheaper' ||
			question.type === 'efficiency' ||
			question.type === 'attribute'
		) {
			ids.add(question.productIds[0]);
			ids.add(question.productIds[1]);
		} else {
			ids.add(question.productId);
		}
	}
	return [...ids];
}

/**
 * Builds the immutable archive record for a finished day from its manifest.
 * Returns `null` when the manifest no longer rebuilds to a valid game.
 */
export async function buildArchiveGame(manifest: DailyGameManifest): Promise<ArchiveGame | null> {
	const game = await reconstructDailyGame(manifest);
	if (!game) return null;
	const products: ArchiveProduct[] = [];
	for (const id of requiredProductIds(game)) {
		const product = manifest.products.find((item) => item[AllColumns.Number] === id);
		if (!product) return null;
		products.push({
			[AllColumns.Number]: product[AllColumns.Number],
			[AllColumns.Name]: product[AllColumns.Name],
			[AllColumns.Price]: product[AllColumns.Price],
			[AllColumns.Manufacturer]: product[AllColumns.Manufacturer],
			[AllColumns.Type]: product[AllColumns.Type],
			[AllColumns.PackagingType]: product[AllColumns.PackagingType]
		});
	}
	return { version: DAILY_GAME_VERSION, date: game.date, game, products };
}

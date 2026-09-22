import { describe, expect, it } from 'bun:test';
import { AllColumns } from '$lib/utils/constants';
import type { PriceListItem } from '$lib/types';
import { createRng } from './rng';
import { DAILY_QUESTION_COUNT, generateDailyGame } from './questions';
import {
	ARCHIVE_INDEX_VERSION,
	buildArchiveGame,
	DAILY_MIN_VARIANTS,
	generateDailyGameManifest,
	questionVariant,
	reconstructDailyGame,
	requiredProductIds,
	sha256Hex,
	trimProduct,
	type DailyGameManifest
} from './manifest';

const product = (id: string, price: number, volume = 0.7, alcohol = 12, history: unknown[] = []) =>
	({
		[AllColumns.Number]: id,
		[AllColumns.Name]: `Product ${id}`,
		[AllColumns.Price]: price,
		[AllColumns.BottleSize]: volume,
		[AllColumns.PricePerLiter]: price / volume,
		[AllColumns.AlcoholPercentage]: alcohol,
		[AllColumns.Manufacturer]: `Maker ${id}`,
		[AllColumns.Country]: `Country ${id}`,
		[AllColumns.Type]: `Type ${id}`,
		[AllColumns.Sugar]: Number(id),
		[AllColumns.Energy]: 100 + Number(id),
		[AllColumns.NormalPrice]: price + 2,
		[AllColumns.AlcoholGramsPerEuro]: (volume * alcohol * 10) / price,
		[AllColumns.History]: history
	}) as unknown as PriceListItem;

const products = [
	product('1', 8),
	product('2', 12, 0.5, 5),
	product('3', 18, 0.75, 40),
	product('4', 25, 0.7, 13),
	product('5', 32, 0.75, 14, [{ date: '2025-01-01', price: 29 }])
];

describe('daily game manifest', () => {
	it('trimming the pool does not change the generated game', () => {
		const seed = 'alkometriikka-daily-v1-2026-09-22';
		const trimmed = products.map(trimProduct) as unknown as PriceListItem[];
		expect(generateDailyGame('2026-09-22', trimmed, createRng(seed))).toEqual(
			generateDailyGame('2026-09-22', products, createRng(seed))
		);
	});

	it('bakes a manifest that rebuilds to the exact hashed game', async () => {
		const manifest: DailyGameManifest = await generateDailyGameManifest('2026-09-22', products);
		expect(manifest.version).toBe(7);
		expect(manifest.date).toBe('2026-09-22');
		expect(manifest.seed.length).toBeGreaterThan(0);
		expect(manifest.products.length).toBe(5);
		expect(manifest.gameHash.length).toBeGreaterThan(0);
		expect(JSON.stringify(manifest)).not.toContain('correctPrice');
		expect(JSON.stringify(manifest)).not.toContain('correctProductId');
		expect(JSON.stringify(manifest)).not.toContain('correctValue');

		const questionCount = generateDailyGame(
			manifest.date,
			manifest.products as unknown as PriceListItem[],
			createRng(manifest.seed)
		).questions.length;
		expect(questionCount).toBe(DAILY_QUESTION_COUNT);
		expect(
			new Set(
				generateDailyGame(
					manifest.date,
					manifest.products as unknown as PriceListItem[],
					createRng(manifest.seed)
				).questions.map(questionVariant)
			).size
		).toBeGreaterThanOrEqual(DAILY_MIN_VARIANTS);

		const rebuilt = await reconstructDailyGame(manifest);
		expect(rebuilt).not.toBeNull();
		expect(rebuilt!.questions).toHaveLength(DAILY_QUESTION_COUNT);
		expect(rebuilt!.version).toBe(manifest.version);
	});

	it('rejects manifests whose canonical game does not hash to gameHash', async () => {
		const manifest: DailyGameManifest = await generateDailyGameManifest('2026-09-22', products);
		const tampered: DailyGameManifest = { ...manifest, gameHash: 'f'.repeat(64) };
		expect(await reconstructDailyGame(tampered)).toBeNull();
	});

	it('hashes deterministically', async () => {
		const input = JSON.stringify({ date: '2026-09-22', seed: 'aabbccdd' });
		expect(await sha256Hex(input)).toBe(await sha256Hex(input));
		expect(await sha256Hex('abc')).toBe(
			'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
		);
	});

	it('collects every product referenced by the questions', async () => {
		const manifest: DailyGameManifest = await generateDailyGameManifest('2026-09-22', products);
		const rebuilt = await reconstructDailyGame(manifest);
		expect(rebuilt).not.toBeNull();
		const ids = requiredProductIds(rebuilt!);
		expect(ids.length).toBeGreaterThan(0);
		for (const question of rebuilt!.questions) {
			if (
				question.type === 'cheaper' ||
				question.type === 'efficiency' ||
				question.type === 'attribute'
			) {
				expect(ids).toContain(question.productIds[0]);
				expect(ids).toContain(question.productIds[1]);
			} else {
				expect(ids).toContain(question.productId);
			}
		}
	});

	it('builds an immutable archive game with embedded display products', async () => {
		const manifest: DailyGameManifest = await generateDailyGameManifest('2026-09-21', products);
		const archive = await buildArchiveGame(manifest);
		expect(archive).not.toBeNull();
		expect(archive!.version).toBe(manifest.version);
		expect(archive!.date).toBe('2026-09-21');
		expect(archive!.game.questions).toHaveLength(DAILY_QUESTION_COUNT);
		expect(archive!.game).toEqual((await reconstructDailyGame(manifest))!);

		const ids = requiredProductIds(archive!.game);
		expect(archive!.products.map((p) => p[AllColumns.Number])).toEqual(ids);
		expect(new Set(archive!.products.map((p) => p[AllColumns.Number])).size).toBe(ids.length);
	});

	it('fails to build an archive when the manifest game hash does not match', async () => {
		const manifest: DailyGameManifest = await generateDailyGameManifest('2026-09-21', products);
		expect(await buildArchiveGame({ ...manifest, gameHash: 'f'.repeat(64) })).toBeNull();
	});

	it('archive index version is stable', () => {
		expect(ARCHIVE_INDEX_VERSION).toBe(1);
	});
});

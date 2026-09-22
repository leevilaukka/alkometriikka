import { beforeEach, describe, expect, it } from 'bun:test';
import { AllColumns } from '$lib/utils/constants';
import type { PriceListItem } from '$lib/types';
import { createRng } from './rng';
import { DAILY_QUESTION_COUNT, generateDailyGame, pureAlcoholPerEuro } from './questions';
import { completeGame, loadSavedGame, saveGame } from './storage';

const product = (id: string, price: number, volume = 0.7, alcohol = 12, history: unknown[] = []) => ({
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
	[AllColumns.AlcoholGramsPerEuro]: volume * alcohol * 10 / price,
	[AllColumns.History]: history
}) as unknown as PriceListItem;

const products = [product('1', 8), product('2', 12, 0.5, 5), product('3', 18, 0.75, 40), product('4', 25, 0.7, 13), product('5', 32, 0.75, 14, [{ date: '2025-01-01', price: 29 }])];

describe('daily game generation', () => {
	it('is deterministic for a date and dataset', () => {
		const first = generateDailyGame('2026-09-22', products, createRng('alkometriikka-daily-v1-2026-09-22'));
		expect(first).toEqual(generateDailyGame('2026-09-22', products, createRng('alkometriikka-daily-v1-2026-09-22')));
	});

	it('does not depend on the engine sort algorithm (fixed RNG consumption for options)', () => {
		// Golden output. uniquePrices must shuffle distractors with the seeded
		// Fisher-Yates shuffle, never `sort(() => random() - 0.5)`: a random
		// comparator makes the number of RNG draws engine-specific (V8 vs
		// JavaScriptCore vs SpiderMonkey), so the same date would produce
		// different questions on different devices.
		const game = generateDailyGame('2026-09-22', products, createRng('alkometriikka-daily-v1-2026-09-22'));
		expect(game.questions).toEqual([
			{
				type: 'choice',
				field: 'country',
				productId: '5',
				options: ['Country 1', 'Country 5', 'Country 2', 'Country 3'],
				correctValue: 'Country 5'
			},
			{
				type: 'price',
				productId: '1',
				options: [8, 25, 12, 18],
				correctPrice: 8
			},
			{
				type: 'attribute',
				metric: 'energy',
				productIds: ['4', '3'],
				correctProductId: '4',
				values: { '3': 103, '4': 104 }
			},
			{
				type: 'cheaper',
				productIds: ['2', '3'],
				correctProductId: '2'
			},
			{
				type: 'attribute',
				metric: 'alcohol',
				productIds: ['5', '3'],
				correctProductId: '3',
				values: { '3': 40, '5': 14 }
			},
			{
				type: 'attribute',
				metric: 'volume',
				productIds: ['3', '4'],
				correctProductId: '3',
				values: { '3': 0.75, '4': 0.7 }
			},
			{
				type: 'efficiency',
				productIds: ['1', '2'],
				correctProductId: '1',
				efficiency: { '1': 10.499999999999998, '2': 2.0833333333333335 }
			}
		]);
	});

	it('normally changes with the date and always has seven questions', () => {
		const first = generateDailyGame('2026-09-22', products, createRng('first'));
		const second = generateDailyGame('2026-09-23', products, createRng('second'));
		expect(first.questions).toHaveLength(DAILY_QUESTION_COUNT);
		expect(second.questions).toHaveLength(DAILY_QUESTION_COUNT);
		expect(first).not.toEqual(second);
	});

	it('shuffles the available question types while staying deterministic', () => {
		const first = generateDailyGame('2026-09-22', products, createRng('date-one'));
		const same = generateDailyGame('2026-09-22', products, createRng('date-one'));
		const next = generateDailyGame('2026-09-23', products, createRng('date-two'));
		expect(first.questions.map((question) => question.type)).toEqual(same.questions.map((question) => question.type));
		expect(first.questions.map((question) => question.type)).not.toEqual(next.questions.map((question) => question.type));
	});

	it('excludes invalid products and keeps answer keys correct', () => {
		const game = generateDailyGame('2026-09-22', [...products, product('bad', 0), product('', 4)], createRng('test'));
		for (const question of game.questions) {
			expect(JSON.stringify(question)).not.toContain('bad');
			if (question.type === 'price') expect(question.options).toContain(question.correctPrice);
			if (question.type === 'cheaper') {
				const [first, second] = question.productIds.map((id) => products.find((item) => item[AllColumns.Number] === id)!);
				expect(question.correctProductId).toBe(first[AllColumns.Price] <= second[AllColumns.Price] ? question.productIds[0] : question.productIds[1]);
			}
			if (question.type === 'efficiency') expect(question.correctProductId).toBe(Object.entries(question.efficiency).sort((a, b) => b[1] - a[1])[0][0]);
			if (question.type === 'attribute') expect(question.values[question.productIds[0]]).not.toBe(question.values[question.productIds[1]]);
		}
	});

	it('always marks the lower-priced product as cheaper', () => {
		for (let seed = 0; seed < 100; seed += 1) {
			const game = generateDailyGame(`cheaper-${seed}`, products, createRng(`cheaper-${seed}`));
			for (const question of game.questions) {
				if (question.type !== 'cheaper') continue;
				const [first, second] = question.productIds.map((id) => products.find((item) => item[AllColumns.Number] === id)!);
				const expected = first[AllColumns.Price] < second[AllColumns.Price] ? question.productIds[0] : question.productIds[1];
				expect(question.correctProductId).toBe(expected);
			}
		}
	});

	it('calculates pure alcohol efficiency', () => expect(pureAlcoholPerEuro(products[0])).toBeCloseTo(10.5));
});

describe('daily persistence and streaks', () => {
	beforeEach(() => {
		const values = new Map<string, string>();
		globalThis.localStorage = {
			clear: () => values.clear(),
			getItem: (key: string) => values.get(key) ?? null,
			setItem: (key: string, value: string) => values.set(key, value),
			removeItem: (key: string) => values.delete(key),
			key: (index: number) => [...values.keys()][index] ?? null,
			length: values.size
		} as Storage;
		localStorage.clear();
	});

	it('reuses a saved date and generates a new date separately', () => {
		const game = generateDailyGame('2026-09-22', products, createRng('same'));
		saveGame({ date: game.date, game, currentIndex: 2, points: [100, 0], correctAnswers: [true, false], answered: true, selectedAnswer: '1', answerPoints: 0 });
		const saved = loadSavedGame('2026-09-22');
		expect(saved?.game).toEqual(game);
		expect(saved?.currentIndex).toBe(2);
		expect(saved?.answered).toBe(true);
		expect(loadSavedGame('2026-09-23')).toBeNull();
	});

	it('does not increment the streak twice for one completion', () => {
		const game = generateDailyGame('2026-09-22', products, createRng('same'));
		const saved = { date: game.date, game };
		const first = completeGame(saved, 400, 4);
		const second = completeGame({ ...saved, completed: true, score: 400, correct: 4 }, 400, 4);
		expect(first.current).toBe(1);
		expect(second.current).toBe(1);
		expect(loadSavedGame('2026-09-22')?.completed).toBe(true);
	});
});
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AllColumns } from '$lib/utils/constants';
import type { PriceListItem } from '$lib/types';
import { DAILY_GAME_VERSION, DAILY_QUESTION_COUNT, type Question } from '$lib/daily/questions';
import {
	buildArchiveGame,
	generateDailyGameManifest,
	reconstructDailyGame,
	type ArchiveGame,
	type DailyGameManifest
} from '$lib/daily/manifest';
import { questionPoints } from '$lib/daily/scoring';
import {
	clearUnlimitedProgress,
	completeGame,
	loadArchivedScores,
	loadArchiveRuns,
	loadSavedGame,
	loadStreak,
	loadUnlimitedProgress,
	resetDailyGame,
	saveArchiveRuns,
	saveGame,
	saveUnlimitedProgress
} from '$lib/daily/storage';
import { dateForDayNumber, dayNumberForDate } from '$lib/daily/dayNumber';
import type { ArchiveRunState } from '$lib/daily/types';
import { createArchiveTarball, extractArchiveTarball } from '../../scripts/site/backup-archive';

const product = (id: string, price: number, volume = 0.7, alcohol = 12) =>
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
		[AllColumns.History]: []
	}) as unknown as PriceListItem;

const catalog = [
	product('1', 8),
	product('2', 12, 0.5, 5),
	product('3', 18, 0.75, 40),
	product('4', 25, 0.7, 13),
	product('5', 32, 0.75, 14)
];

const correctAnswer = (question: Question): string | number =>
	question.type === 'price' || question.type === 'estimate'
		? question.correctPrice
		: question.type === 'choice'
			? question.correctValue
			: question.correctProductId;

/** A deliberately wrong answer for every question type. */
const wrongAnswer = (question: Question): string | number =>
	question.type === 'price' || question.type === 'estimate'
		? question.correctPrice + 1000
		: question.type === 'choice'
			? question.options.find((option) => option !== question.correctValue)!
			: question.productIds.find((id) => id !== question.correctProductId)!;

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
});

describe('daily lifecycle: bake → play → archive → backup', () => {
	let dir: string;
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'alko-daily-lifecycle-'));
	});
	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	it('plays a baked day to a perfect score, then replays it from the archive after a backup restore', async () => {
		// 1. The pipeline bakes the day's answer-free manifest.
		const date = '2026-09-22';
		const manifest = await generateDailyGameManifest(date, catalog);
		const manifestPath = join(dir, 'daily', `${date}.json`);
		mkdirSync(join(dir, 'daily'), { recursive: true });
		writeFileSync(manifestPath, JSON.stringify(manifest));
		expect(readFileSync(manifestPath, 'utf8')).not.toContain('correct');

		// 2. A client downloads it, rebuilds the exact game and plays it.
		const downloaded = JSON.parse(readFileSync(manifestPath, 'utf8')) as DailyGameManifest;
		const game = (await reconstructDailyGame(downloaded))!;
		expect(game.questions).toHaveLength(DAILY_QUESTION_COUNT);

		const points: number[] = [];
		const correctAnswers: boolean[] = [];
		game.questions.forEach((question, index) => {
			points.push(questionPoints(question, correctAnswer(question)));
			correctAnswers.push(true);
			saveGame({
				date,
				game,
				products: downloaded.products,
				currentIndex: index + 1,
				points: [...points],
				correctAnswers: [...correctAnswers]
			});
			// Reloading mid-game resumes exactly where the player left off.
			expect(loadSavedGame(date)?.currentIndex).toBe(index + 1);
		});
		const score = points.reduce((sum, value) => sum + value, 0);
		expect(score).toBe(DAILY_QUESTION_COUNT * 100);

		// 3. Completing records the result and starts the streak.
		const streak = completeGame(loadSavedGame(date)!, score, DAILY_QUESTION_COUNT);
		expect(streak).toEqual({ current: 1, best: 1, completedDate: date });
		expect(loadSavedGame(date)).toMatchObject({ completed: true, score });
		expect(loadArchivedScores()[date]).toEqual({ score, correct: DAILY_QUESTION_COUNT });

		// 4. After midnight the day is archived: the archive is the same game, answers included.
		const archive = (await buildArchiveGame(downloaded))!;
		expect(archive.game).toEqual(game);
		const archiveDir = join(dir, 'daily', 'archive');
		mkdirSync(archiveDir, { recursive: true });
		writeFileSync(join(archiveDir, `${date}.json`), JSON.stringify(archive));
		writeFileSync(join(archiveDir, 'index.json'), JSON.stringify({ version: 1, dates: [date] }));

		// 5. The archive is backed up, the originals are lost, and a restore brings them back.
		const { compressed, fileCount } = await createArchiveTarball(archiveDir);
		expect(fileCount).toBe(2);
		const restoreDir = join(dir, 'restored');
		mkdirSync(restoreDir);
		await extractArchiveTarball(compressed, restoreDir);

		const restored = JSON.parse(
			readFileSync(join(restoreDir, `${date}.json`), 'utf8')
		) as ArchiveGame;
		expect(restored).toEqual(archive);

		// 6. A player replays the restored archive day and gets the same scoring.
		const replay = restored.game.questions.map((question) =>
			questionPoints(question, wrongAnswer(question))
		);
		expect(replay.every((value) => value === 0)).toBe(true);
		expect(
			restored.game.questions.map((question) => questionPoints(question, correctAnswer(question)))
		).toEqual(points);
	});

	it('keeps archived days self-contained after products leave the catalog', async () => {
		const manifest = await generateDailyGameManifest('2026-09-22', catalog);
		const archive = (await buildArchiveGame(manifest))!;
		// Archive products are display data copied from the frozen pool, not the live catalog.
		for (const archived of archive.products) {
			const frozen = manifest.products.find(
				(p) => p[AllColumns.Number] === archived[AllColumns.Number]
			)!;
			expect(archived[AllColumns.Name]).toBe(frozen[AllColumns.Name]);
			expect(archived[AllColumns.Price]).toBe(frozen[AllColumns.Price]);
		}
		expect(JSON.stringify(archive.products)).not.toContain('Sugar');
	});

	it('refuses to archive a manifest that lost products from its pool', async () => {
		const manifest = await generateDailyGameManifest('2026-09-22', catalog);
		expect(
			await buildArchiveGame({ ...manifest, products: manifest.products.slice(0, 1) })
		).toBeNull();
	});

	it('is independent per day: baking another date yields a different game', async () => {
		const first = await generateDailyGameManifest('2026-09-22', catalog);
		const second = await generateDailyGameManifest('2026-09-23', catalog);
		expect(first.date).not.toBe(second.date);
		expect(first.seed).not.toBe(second.seed);
		expect(first.gameHash).not.toBe(second.gameHash);
	});
});

describe('daily lifecycle: player state across days', () => {
	const finish = async (date: string, score: number) => {
		const manifest = await generateDailyGameManifest(date, catalog);
		const game = (await reconstructDailyGame(manifest))!;
		return completeGame(
			{ date, game, products: manifest.products },
			score,
			Math.round(score / 100)
		);
	};

	it('builds a streak over consecutive days, resets after a gap and remembers the best', async () => {
		expect(loadStreak()).toEqual({ current: 0, best: 0 });
		await finish('2026-09-22', 700);
		await finish('2026-09-23', 500);
		expect(await finish('2026-09-24', 300)).toMatchObject({ current: 3, best: 3 });

		expect(await finish('2026-09-27', 100)).toEqual({
			current: 1,
			best: 3,
			completedDate: '2026-09-27'
		});
		expect(loadStreak()).toMatchObject({ current: 1, best: 3 });
		expect(Object.keys(loadArchivedScores()).sort()).toEqual([
			'2026-09-22',
			'2026-09-23',
			'2026-09-24',
			'2026-09-27'
		]);
	});

	it("discards yesterday's save and a save from an older game version", async () => {
		const manifest = await generateDailyGameManifest('2026-09-22', catalog);
		const game = (await reconstructDailyGame(manifest))!;
		saveGame({ date: '2026-09-22', game });
		expect(loadSavedGame('2026-09-23')).toBeNull();

		saveGame({ date: '2026-09-22', game: { ...game, version: DAILY_GAME_VERSION - 1 } as never });
		expect(loadSavedGame('2026-09-22')).toBeNull();

		saveGame({ date: '2026-09-22', game: { ...game, questions: game.questions.slice(1) } });
		expect(loadSavedGame('2026-09-22')).toBeNull();
	});

	it('compacts finished archive runs but leaves in-progress runs untouched', () => {
		const inProgress: ArchiveRunState = {
			date: '2026-09-21',
			currentIndex: 2,
			points: [100, 0],
			correctAnswers: [true, false],
			answers: ['a', 'b'],
			selectedAnswer: 'c',
			answered: true,
			answerPoints: 100
		};
		const finished: ArchiveRunState = {
			...inProgress,
			date: '2026-09-20',
			completed: true,
			score: 100,
			correct: 1
		};
		saveArchiveRuns({ '2026-09-21': inProgress, '2026-09-20': finished });

		const runs = loadArchiveRuns();
		expect(runs['2026-09-21']).toEqual(inProgress);
		expect(runs['2026-09-20']).toEqual({
			...finished,
			selectedAnswer: null,
			answered: false,
			answerPoints: 0
		});
		expect(runs['2026-09-20']!.answers).toEqual(['a', 'b']);
	});

	it('resetDailyGame wipes the daily save, streak and unlimited run but keeps archive scores', async () => {
		await finish('2026-09-22', 700);
		const manifest = await generateDailyGameManifest('2026-09-23', catalog);
		const game = (await reconstructDailyGame(manifest))!;
		saveUnlimitedProgress({
			game,
			currentIndex: 1,
			selectedAnswer: null,
			answered: false,
			answerPoints: 0,
			points: [100],
			correctAnswers: [true]
		});
		expect(loadUnlimitedProgress()?.currentIndex).toBe(1);

		resetDailyGame();
		expect(loadSavedGame('2026-09-22')).toBeNull();
		expect(loadStreak()).toEqual({ current: 0, best: 0 });
		expect(loadUnlimitedProgress()).toBeNull();
		expect(loadArchivedScores()['2026-09-22']).toEqual({ score: 700, correct: 7 });

		saveUnlimitedProgress({
			game,
			currentIndex: 0,
			selectedAnswer: null,
			answered: false,
			answerPoints: 0,
			points: [],
			correctAnswers: []
		});
		clearUnlimitedProgress();
		expect(loadUnlimitedProgress()).toBeNull();
	});
});

describe('daily day numbering', () => {
	it('numbers days from launch and round-trips', () => {
		expect(dayNumberForDate('2026-09-22')).toBe(1);
		expect(dayNumberForDate('2026-09-23')).toBe(2);
		expect(dayNumberForDate('2026-10-01')).toBe(10);
		for (const n of [1, 9, 10, 100, 365]) expect(dayNumberForDate(dateForDayNumber(n))).toBe(n);
		expect(dateForDayNumber(10)).toBe('2026-10-01');
	});
});

import { LocalStorageKeys } from '$lib/utils/constants';
import { LocalStorageManager } from '$lib/utils/storage';
import {
	DAILY_GAME_VERSION,
	DAILY_QUESTION_COUNT,
	type ArchivedScores,
	type ArchiveRuns,
	type DailyStreak,
	type SavedDailyGame
} from './questions';
import type { UnlimitedRunState } from './questions';

export type { DailyStreak, SavedDailyGame, UnlimitedRunState } from './questions';

export function loadSavedGame(date: string): SavedDailyGame | null {
	const saved = LocalStorageManager.getItem(LocalStorageKeys.DailyGame);
	return saved?.date === date &&
		saved.game?.date === date &&
		saved.game.version === DAILY_GAME_VERSION &&
		Array.isArray(saved.game.questions) &&
		saved.game.questions.length === DAILY_QUESTION_COUNT
		? saved
		: null;
}

export function saveGame(saved: SavedDailyGame) {
	LocalStorageManager.setItem(LocalStorageKeys.DailyGame, saved);
}

export function completeGame(saved: SavedDailyGame, score: number, correct: number): DailyStreak {
	const completedGame = { ...saved, completed: true, score, correct };
	saveGame(completedGame);
	recordArchivedScore(saved.date, score, correct);
	const streak = LocalStorageManager.getItem(LocalStorageKeys.DailyStreak) ?? {
		current: 0,
		best: 0
	};
	if (streak.completedDate === saved.date) return streak;
	// Pure UTC date arithmetic: mixing local noon with toISOString() skipped or
	// repeated a day for players in UTC+13/+14 and UTC-12.
	const [year, month, day] = saved.date.split('-').map(Number);
	const yesterdayDate = new Date(Date.UTC(year!, month! - 1, day! - 1)).toISOString().slice(0, 10);
	const current = streak.completedDate === yesterdayDate ? streak.current + 1 : 1;
	const next: DailyStreak = {
		current,
		best: Math.max(streak.best, current),
		completedDate: saved.date
	};
	LocalStorageManager.setItem(LocalStorageKeys.DailyStreak, next);
	return next;
}

export function loadStreak(): DailyStreak {
	return LocalStorageManager.getItem(LocalStorageKeys.DailyStreak) ?? { current: 0, best: 0 };
}

export function loadArchivedScores(): ArchivedScores {
	return LocalStorageManager.getItem(LocalStorageKeys.DailyArchiveScores) ?? {};
}

export function recordArchivedScore(date: string, score: number, correct: number): void {
	const scores = loadArchivedScores();
	scores[date] = { score, correct };
	LocalStorageManager.setItem(LocalStorageKeys.DailyArchiveScores, scores);
}

export function loadArchiveRuns(): ArchiveRuns {
	return LocalStorageManager.getItem(LocalStorageKeys.DailyArchiveRuns) ?? {};
}

export function saveArchiveRuns(runs: ArchiveRuns): void {
	const compacted: ArchiveRuns = {};
	for (const [date, run] of Object.entries(runs)) {
		if (!run || run.completed !== true) {
			compacted[date] = run;
			continue;
		}
		compacted[date] = {
			date: run.date ?? date,
			currentIndex: run.currentIndex,
			points: [],
			correctAnswers: [],
			selectedAnswer: null,
			answered: false,
			answerPoints: 0,
			completed: true,
			score: run.score,
			correct: run.correct
		};
	}
	LocalStorageManager.setItem(LocalStorageKeys.DailyArchiveRuns, compacted);
}

export function resetDailyGame() {
	LocalStorageManager.removeItem(LocalStorageKeys.DailyGame);
	LocalStorageManager.removeItem(LocalStorageKeys.DailyStreak);
	LocalStorageManager.removeItem(LocalStorageKeys.DailyUnlimitedRun);
}

export function loadUnlimitedProgress(): UnlimitedRunState | null {
	return LocalStorageManager.getItem(LocalStorageKeys.DailyUnlimitedRun);
}

export function saveUnlimitedProgress(progress: UnlimitedRunState) {
	LocalStorageManager.setItem(LocalStorageKeys.DailyUnlimitedRun, progress);
}

export function clearUnlimitedProgress() {
	LocalStorageManager.removeItem(LocalStorageKeys.DailyUnlimitedRun);
}

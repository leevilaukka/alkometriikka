import { LocalStorageKeys } from '$lib/utils/constants';
import { LocalStorageManager } from '$lib/utils/storage';
import { DAILY_GAME_VERSION, DAILY_QUESTION_COUNT, type DailyStreak, type SavedDailyGame } from './questions';
import type { UnlimitedRunState } from './questions';

export type { DailyStreak, SavedDailyGame, UnlimitedRunState } from './questions';

export function loadSavedGame(date: string): SavedDailyGame | null {
	const saved = LocalStorageManager.getItem(LocalStorageKeys.DailyGame);
	return saved?.date === date && saved.game?.date === date && saved.game.version === DAILY_GAME_VERSION && Array.isArray(saved.game.questions) && saved.game.questions.length === DAILY_QUESTION_COUNT ? saved : null;
}

export function saveGame(saved: SavedDailyGame) {
	LocalStorageManager.setItem(LocalStorageKeys.DailyGame, saved);
}

export function completeGame(saved: SavedDailyGame, score: number, correct: number): DailyStreak {
	const completedGame = { ...saved, completed: true, score, correct };
	saveGame(completedGame);
	const streak = LocalStorageManager.getItem(LocalStorageKeys.DailyStreak) ?? { current: 0, best: 0 };
	if (streak.completedDate === saved.date) return streak;
	const yesterday = new Date(`${saved.date}T12:00:00`);
	yesterday.setDate(yesterday.getDate() - 1);
	const yesterdayDate = yesterday.toISOString().slice(0, 10);
	const current = streak.completedDate === yesterdayDate ? streak.current + 1 : 1;
	const next: DailyStreak = { current, best: Math.max(streak.best, current), completedDate: saved.date };
	LocalStorageManager.setItem(LocalStorageKeys.DailyStreak, next);
	return next;
}

export function loadStreak(): DailyStreak {
	return LocalStorageManager.getItem(LocalStorageKeys.DailyStreak) ?? { current: 0, best: 0 };
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
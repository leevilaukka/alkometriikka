import type { DailyProduct } from './manifest';
import type { GeneratedGame } from './questions';

/** Shapes persisted to localStorage for the Daily game (see LocalStorageKeys). */
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

import type { EstimateQuestion, Question } from './questions';

/** Share of the price that still counts as a perfect guess. */
const ESTIMATE_FULL_MARKS_TOLERANCE = 0.05;

function scoreEstimate(question: EstimateQuestion, guess: number): number {
	if (!Number.isFinite(guess) || guess < 0) return 0;
	const scale = Math.max(question.correctPrice, 1);
	const difference = Math.abs(guess - question.correctPrice);
	const excess = Math.max(0, difference - scale * ESTIMATE_FULL_MARKS_TOLERANCE);
	return Math.round(100 * Math.exp(-excess / scale));
}

export function questionPoints(question: Question, answer: string | number): number {
	switch (question.type) {
		case 'estimate':
			return scoreEstimate(question, Number(answer));
		case 'price':
			return Number(answer) === question.correctPrice ? 100 : 0;
		case 'choice':
			return answer === question.correctValue ? 100 : 0;
		case 'cheaper':
		case 'efficiency':
		case 'attribute':
			return answer === question.correctProductId ? 100 : 0;
	}
}

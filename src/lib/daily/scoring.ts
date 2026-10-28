import type { EstimateQuestion, Question } from './questions';

function scoreEstimate(question: EstimateQuestion, guess: number): number {
	if (!Number.isFinite(guess) || guess < 0) return 0;
	const difference = Math.abs(guess - question.correctPrice);
	return Math.max(0, Math.round(100 * Math.exp(-difference / Math.max(question.correctPrice, 1))));
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

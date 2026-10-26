import { describe, expect, it } from 'bun:test';
import { foodPairingLabel, formatFoodPairings } from '$lib/utils/catalog/food';

describe('foodPairingLabel', () => {
	it('maps known ids to their Finnish labels', () => {
		expect(foodPairingLabel('foodSymbol_Ayriaiset')).toBe('Äyriäiset');
		expect(foodPairingLabel('foodSymbol_Kana_kalkkuna')).toBe('Kana ja kalkkuna');
	});

	it('falls back to a readable form of unknown ids', () => {
		expect(foodPairingLabel('foodSymbol_Uusi_ruoka')).toBe('Uusi ruoka');
	});
});

describe('formatFoodPairings', () => {
	it('lists the labels', () => {
		expect(formatFoodPairings(['foodSymbol_Porsas', 'foodSymbol_Pasta_ja_pizza'])).toEqual([
			'Porsas',
			'Pasta ja pizza'
		]);
	});

	it('drops duplicates and non-string entries', () => {
		expect(formatFoodPairings(['foodSymbol_Porsas', null, ' foodSymbol_Porsas ', ''])).toEqual([
			'Porsas'
		]);
	});

	it('returns null when there are no pairings', () => {
		expect(formatFoodPairings(null)).toBeNull();
		expect(formatFoodPairings([])).toBeNull();
	});
});

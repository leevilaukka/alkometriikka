import { describe, expect, it } from 'bun:test';
import {
	pricePerServing,
	productDescription,
	staticPage,
	storeAddress,
	storeDescription,
	STATIC_PAGES
} from '$lib/utils/app/seo';

describe('productDescription', () => {
	it('lists abv, size, price, litre price and category', () => {
		expect(
			productDescription({
				name: 'Original Long Drink',
				category: 'Panimotuotteet / juomasekoitukset',
				volume: 0.33,
				alcoholPercentage: 5.5,
				price: 3.19,
				pricePerLitre: 9.36
			})
		).toBe(
			'Original Long Drink: 5,5 % · 0,33 l · 3,19 € (9,36 €/l) · 2,67 €/annos · Panimotuotteet / juomasekoitukset. Vertaa hintoja ja vastaavia tuotteita Alkometriikassa.'
		);
	});

	it('pads prices to two decimals and omits missing facts', () => {
		expect(productDescription({ name: 'Viini', price: 10 })).toBe(
			'Viini: 10,00 €. Vertaa hintoja ja vastaavia tuotteita Alkometriikassa.'
		);
		expect(productDescription({ name: 'Viini', alcoholPercentage: 0, volume: null })).toBe(
			'Viini. Vertaa hintoja ja vastaavia tuotteita Alkometriikassa.'
		);
	});
});

describe('pricePerServing', () => {
	it('prices a 12 g serving like the app calculator', () => {
		// 0.7 l × 40 % × 789 g/l = 220.92 g = 18.41 servings
		expect(
			pricePerServing({ name: 'Viina', volume: 0.7, alcoholPercentage: 40, price: 20 })
		).toBeCloseTo(1.0864, 4);
	});

	it('is null without alcohol, volume or price', () => {
		expect(
			pricePerServing({ name: 'Alkoholiton', volume: 0.33, alcoholPercentage: 0, price: 2 })
		).toBeNull();
		expect(pricePerServing({ name: 'Viini', price: 10 })).toBeNull();
		expect(pricePerServing({ name: 'Viini', volume: 0.75, alcoholPercentage: 12 })).toBeNull();
	});
});

describe('store copy', () => {
	const store = {
		name: 'Helsinki Arkadia',
		address: 'Salomonkatu 1',
		postalCode: '00100',
		postOffice: 'HELSINKI',
		city: 'Helsinki'
	};

	it('prefers the city over the upper-cased post office', () => {
		expect(storeAddress(store)).toBe('Salomonkatu 1, 00100 Helsinki');
		expect(storeAddress({ ...store, city: undefined })).toBe('Salomonkatu 1, 00100 HELSINKI');
	});

	it('includes the address in the description', () => {
		expect(storeDescription(store)).toContain('Helsinki Arkadia, Salomonkatu 1, 00100 Helsinki');
		expect(storeDescription({ name: 'X' })).toBe(
			'Alkon myymälä X. Katso aukioloajat, osoite ja valikoima Alkometriikasta!'
		);
	});
});

describe('static pages', () => {
	it('has unique, slash-terminated paths', () => {
		const paths = STATIC_PAGES.map((page) => page.path);
		expect(new Set(paths).size).toBe(paths.length);
		for (const path of paths) expect(path).toMatch(/^\/[a-z]+\/$/);
	});

	it('throws on unknown paths', () => {
		expect(staticPage('/laskin/').title).toBe('Laskin');
		expect(() => staticPage('/nope/')).toThrow();
	});
});

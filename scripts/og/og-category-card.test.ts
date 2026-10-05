import { describe, expect, it } from 'bun:test';
import { categoryOgDisplays, categoryOgKey, median } from './og-category-card';

const schema = ['Numero', 'Tyyppi', 'Alatyyppi', 'Hinta', 'Litrahinta'];
const row = (id: number, type: string, subType: string, price: number, removed = false) => ({
	values: [String(id), type, subType, price, price / 0.75],
	...(removed ? { meta: { removedFromSelection: '2026-01-01' } } : {})
});

describe('category OG cards', () => {
	const products = [
		...Array.from({ length: 6 }, (_, i) => row(i, 'Viinit', 'punaviinit', 10 + i)),
		...Array.from({ length: 5 }, (_, i) => row(100 + i, 'Viinit', 'valkoviinit', 20)),
		row(200, 'Viinit', 'punaviinit', 1000, true),
		row(300, 'Oluet', 'lager', 2)
	];
	const displays = categoryOgDisplays(schema, products);

	it('makes a card for the index and every category page', () => {
		expect(displays.map((display) => display.path)).toEqual([
			'/kategoriat/',
			'/kategoriat/viinit/',
			'/kategoriat/viinit/punaviinit/',
			'/kategoriat/viinit/valkoviinit/'
		]);
	});

	it('counts and medians only products still in the selection', () => {
		const red = displays.find((display) => display.path === '/kategoriat/viinit/punaviinit/')!;
		expect(red).toMatchObject({ name: 'Punaviinit', parent: 'Viinit', count: 6, medianPrice: 12.5 });
		expect(red.medianPricePerLiter).toBe(16.67);
		expect(displays[1].children).toEqual(['Punaviinit', 'Valkoviinit']);
	});

	it('keys cards by page and content under their own prefix', () => {
		const [index, type] = displays;
		expect(categoryOgKey(index, 'design')).toMatch(/^categories\/index-[0-9a-f]{12}\.png$/);
		expect(categoryOgKey(type, 'design')).toMatch(/^categories\/viinit-[0-9a-f]{12}\.png$/);
		expect(categoryOgKey(type, 'design')).toBe(categoryOgKey({ ...type }, 'design'));
		expect(categoryOgKey(type, 'design')).not.toBe(categoryOgKey({ ...type, count: 1 }, 'design'));
		expect(categoryOgKey(type, 'design')).not.toBe(categoryOgKey(type, 'other'));
	});

	it('computes medians', () => {
		expect(median([])).toBeUndefined();
		expect(median([3, 1, 2])).toBe(2);
		expect(median([4, 1, 3, 2])).toBe(2.5);
	});
});

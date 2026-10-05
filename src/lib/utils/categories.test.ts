import { describe, expect, it } from 'bun:test';
import {
	buildCategoryTree,
	categoryFeedPath,
	categoryPath,
	categorySlug,
	categoryTitle,
	findCategoryBySlugs,
	findProductCategoryTrail,
	MIN_CATEGORY_PRODUCTS,
	type CategoryEntry
} from './categories';

/** `count` active products of the given Tyyppi / Alatyyppi. */
const entries = (type: unknown, subType: unknown, count: number, removed = false): CategoryEntry[] =>
	Array.from({ length: count }, () => ({ type, subType, removed }));

describe('categorySlug', () => {
	it('strips Finnish diacritics and joins words with dashes', () => {
		expect(categorySlug('Väkevät')).toBe('vakevat');
		expect(categorySlug('Kuohuviinit ja samppanjat')).toBe('kuohuviinit-ja-samppanjat');
		expect(categorySlug('Glögit')).toBe('glogit');
	});

	it('collapses punctuation and trims leading and trailing dashes', () => {
		expect(categorySlug('  Rosé- & roseeviinit! ')).toBe('rose-roseeviinit');
		expect(categorySlug('')).toBe('');
	});
});

describe('category paths', () => {
	it('builds page and feed paths with and without a subtype', () => {
		expect(categoryPath('viinit')).toBe('/kategoriat/viinit/');
		expect(categoryPath('viinit', 'punaviinit')).toBe('/kategoriat/viinit/punaviinit/');
		expect(categoryFeedPath('viinit')).toBe('/rss/kategoriat/viinit');
		expect(categoryFeedPath('viinit', 'punaviinit')).toBe('/rss/kategoriat/viinit/punaviinit');
	});
});

describe('buildCategoryTree', () => {
	const tree = buildCategoryTree([
		...entries('viinit', 'punaviinit', 8),
		...entries('Viinit', 'valkoviinit', 6),
		...entries('viinit', 'roseeviinit', MIN_CATEGORY_PRODUCTS - 1),
		// A subtype repeating its parent is a catch-all, not a category of its own
		...entries('viinit', 'viinit', 6),
		...entries('oluet', 'lagerit', 5),
		...entries('oluet', 'lagerit', 10, true),
		...entries('siiderit', '', 2),
		...entries('', 'orvot', 9),
		...entries(null, null, 3)
	]);

	it('merges values that differ only by case and capitalises names', () => {
		const wines = tree.find((node) => node.slug === 'viinit');
		expect(wines?.name).toBe('Viinit');
		expect(wines?.count).toBe(8 + 6 + (MIN_CATEGORY_PRODUCTS - 1) + 6);
		expect(wines?.path).toBe('/kategoriat/viinit/');
	});

	it('counts only active products and drops small categories', () => {
		expect(tree.map((node) => node.slug)).toEqual(['viinit', 'oluet']);
		expect(tree.find((node) => node.slug === 'oluet')?.count).toBe(5);
	});

	it('drops small and catch-all subtypes and sorts the rest by size', () => {
		const wines = tree.find((node) => node.slug === 'viinit');
		expect(wines?.children.map((child) => child.slug)).toEqual(['punaviinit', 'valkoviinit']);
		expect(wines?.children[0]).toMatchObject({ name: 'Punaviinit', count: 8, path: '/kategoriat/viinit/punaviinit/' });
	});
});

describe('category lookups', () => {
	const tree = buildCategoryTree([
		...entries('viinit', 'punaviinit', 8),
		...entries('viinit', 'glögit', 6),
		...entries('välituotteet', 'glögit', 6)
	]);

	it('resolves URL slugs to a trail', () => {
		expect(findCategoryBySlugs(tree, 'viinit')?.map((node) => node.slug)).toEqual(['viinit']);
		expect(findCategoryBySlugs(tree, 'viinit', 'punaviinit')?.map((node) => node.slug)).toEqual([
			'viinit',
			'punaviinit'
		]);
		expect(findCategoryBySlugs(tree, 'viinit', 'olematon')).toBeUndefined();
		expect(findCategoryBySlugs(tree, 'olematon')).toBeUndefined();
	});

	it('titles subcategories with their parent, since a subtype can exist under several types', () => {
		const trail = findCategoryBySlugs(tree, 'valituotteet', 'glogit')!;
		expect(categoryTitle(trail)).toBe('Glögit - Välituotteet');
	});

	it("finds a product's trail, falling back to the type when its subtype has no page", () => {
		expect(findProductCategoryTrail(tree, 'Viinit', 'Punaviinit')).toEqual({
			trail: findCategoryBySlugs(tree, 'viinit', 'punaviinit')!,
			legacy: false
		});
		expect(findProductCategoryTrail(tree, 'viinit', 'harvinaiset').trail.map((node) => node.slug)).toEqual([
			'viinit'
		]);
		expect(findProductCategoryTrail(tree, '', 'punaviinit')).toEqual({ trail: [], legacy: false });
	});

	it('maps an older taxonomy where the subtype was a type, but only when unambiguous', () => {
		// Removed products can carry e.g. "punaviinit" as their Tyyppi
		const legacy = findProductCategoryTrail(tree, 'punaviinit', undefined);
		expect(legacy.legacy).toBe(true);
		expect(legacy.trail.map((node) => node.slug)).toEqual(['viinit', 'punaviinit']);
		// "glögit" exists under two types, so there's no single page to point at
		expect(findProductCategoryTrail(tree, 'glögit', undefined)).toEqual({ trail: [], legacy: true });
	});
});

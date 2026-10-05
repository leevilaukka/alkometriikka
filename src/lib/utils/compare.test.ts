import { beforeEach, describe, expect, it, mock } from 'bun:test';

// The real modules pull in Svelte runes, browser globals and SvelteKit modules
const compareProductIds: string[] = [];
mock.module('$lib/global.svelte', () => ({ compareProductIds }));
// Bun shares module mocks between test files, so this matches the helpers mock in metrics.test.ts
mock.module('./helpers', () => ({
	headerToDisplayName: (header: string) => header,
	isNullish: (value: unknown) => value === null || value === undefined,
	sendAnalyticsEvent: () => {}
}));
const { addToCompareWithReference, MAX_COMPARE_PRODUCTS } = await import('./compare');

function fill(count: number) {
	compareProductIds.push(...Array.from({ length: count }, (_, i) => `other-${i}`));
}

describe('addToCompareWithReference', () => {
	beforeEach(() => {
		compareProductIds.length = 0;
	});

	it('adds the reference first, then the candidate', () => {
		fill(2);
		expect(addToCompareWithReference('ref', 'candidate')).toBe(true);
		expect(compareProductIds).toEqual(['ref', 'other-0', 'other-1', 'candidate']);
	});

	it('adds nothing when the reference and the candidate do not both fit', () => {
		fill(MAX_COMPARE_PRODUCTS - 1);
		expect(addToCompareWithReference('ref', 'candidate')).toBe(false);
		expect(compareProductIds).not.toContain('ref');
		expect(compareProductIds).not.toContain('candidate');
		expect(compareProductIds).toHaveLength(MAX_COMPARE_PRODUCTS - 1);
	});

	it('fills the last slot with the candidate when the reference is already compared', () => {
		fill(MAX_COMPARE_PRODUCTS - 2);
		compareProductIds.push('ref');
		expect(addToCompareWithReference('ref', 'candidate')).toBe(true);
		expect(compareProductIds).toHaveLength(MAX_COMPARE_PRODUCTS);
		expect(compareProductIds.at(-1)).toBe('candidate');
	});

	it('fills the last two slots with the reference and the candidate', () => {
		fill(MAX_COMPARE_PRODUCTS - 2);
		expect(addToCompareWithReference('ref', 'candidate')).toBe(true);
		expect(compareProductIds[0]).toBe('ref');
		expect(compareProductIds).toContain('candidate');
	});

	it('refuses when the selection is full, even with the reference in it', () => {
		fill(MAX_COMPARE_PRODUCTS - 1);
		compareProductIds.push('ref');
		expect(addToCompareWithReference('ref', 'candidate')).toBe(false);
		expect(compareProductIds).not.toContain('candidate');
	});
});

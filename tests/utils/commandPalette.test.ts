import { describe, expect, it } from 'bun:test';
import {
	matchScore,
	normalizeSearchText,
	parseScopePrefix,
	rankEntries,
	type SearchEntry
} from '$lib/utils/commandPalette';

const entry = (name: string, extra: Partial<SearchEntry<string>> = {}): SearchEntry<string> => ({
	value: name,
	keys: [normalizeSearchText(name)],
	...extra
});

describe('normalizeSearchText', () => {
	it('lowercases, strips diacritics and collapses whitespace', () => {
		expect(normalizeSearchText('  Väkevät   Viinit ')).toBe('vakevat viinit');
	});
});

describe('matchScore', () => {
	it('orders exact > prefix > word prefix > substring > scattered words', () => {
		const exact = matchScore('olut', 'olut');
		const prefix = matchScore('olut', 'oluthuone');
		const word = matchScore('vodka', 'koskenkorva vodka');
		const inside = matchScore('korva', 'koskenkorva');
		const scattered = matchScore('kosken vodka', 'koskenkorva salmiakki vodka');
		expect(exact).toBeGreaterThan(prefix);
		expect(prefix).toBeGreaterThan(word);
		expect(word).toBeGreaterThan(inside);
		expect(inside).toBeGreaterThan(scattered);
		expect(scattered).toBeGreaterThan(0);
	});

	it('returns 0 when any word is missing', () => {
		expect(matchScore('kosken gin', 'koskenkorva vodka')).toBe(0);
		expect(matchScore('', 'anything')).toBe(0);
	});
});

describe('rankEntries', () => {
	const entries = [
		entry('Koskenkorva Vodka Salmiakki'),
		entry('Koskenkorva'),
		entry('Lapin Kulta'),
		entry('Old product Koskenkorva', { boost: -30 }),
		entry('Numbered', { ids: ['319027', '6412700000000'] })
	];

	it('ranks best matches first and prefers shorter names on ties', () => {
		expect(rankEntries('kosken', entries, 10).map((r) => r.value)).toEqual([
			'Koskenkorva',
			'Koskenkorva Vodka Salmiakki',
			'Old product Koskenkorva'
		]);
	});

	it('respects the limit', () => {
		expect(rankEntries('kosken', entries, 1).map((r) => r.value)).toEqual(['Koskenkorva']);
	});

	it('matches identifiers by exact value or a prefix of 3+ characters', () => {
		expect(rankEntries('319027', entries, 5).map((r) => r.value)).toEqual(['Numbered']);
		expect(rankEntries('641', entries, 5).map((r) => r.value)).toEqual(['Numbered']);
		expect(rankEntries('31', entries, 5)).toEqual([]);
	});

	it('returns nothing for an empty query', () => {
		expect(rankEntries('', entries, 5)).toEqual([]);
	});
});

describe('parseScopePrefix', () => {
	it('strips a known prefix and returns its scope', () => {
		expect(parseScopePrefix('t:kosken')).toEqual({ scope: 'product', rest: 'kosken' });
		expect(parseScopePrefix('  M: Kamppi')).toEqual({ scope: 'store', rest: 'Kamppi' });
		expect(parseScopePrefix('>teema')).toEqual({ scope: 'action', rest: 'teema' });
		expect(parseScopePrefix('k:')).toEqual({ scope: 'category', rest: '' });
	});

	it('returns null without a prefix', () => {
		expect(parseScopePrefix('koskenkorva')).toBeNull();
		expect(parseScopePrefix('t kosken')).toBeNull();
		expect(parseScopePrefix('')).toBeNull();
	});
});

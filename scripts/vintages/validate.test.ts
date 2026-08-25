import { describe, expect, it } from 'bun:test';
import { validateVintageDocument } from './validate.ts';
import type { ParsedVintageDocument } from './types.ts';

function baseDoc(overrides: Partial<ParsedVintageDocument> = {}): ParsedVintageDocument {
	return {
		source: 'https://example.test/doc.pdf',
		title: 'Test document',
		wineType: 'valkoviinit',
		extractedAt: new Date().toISOString(),
		regions: [
			{
				country: 'Saksa',
				area: 'Mosel',
				name: 'Saksa – Mosel',
				ratings: { '2020': 17, '2021': 19 }
			},
			{ country: 'Saksa', area: 'Nahe', name: 'Saksa – Nahe', ratings: { '2020': 15, '2021': 16 } }
		],
		...overrides
	};
}

describe('validateVintageDocument', () => {
	it('accepts a well-formed document', () => {
		expect(() => validateVintageDocument(baseDoc())).not.toThrow();
	});

	it('rejects an unknown wineType', () => {
		const doc = baseDoc({ wineType: 'roseeviinit' as never });
		expect(() => validateVintageDocument(doc)).toThrow(/Unknown wineType/);
	});

	it('rejects a document with fewer than 2 regions', () => {
		const doc = baseDoc({
			regions: [{ country: 'Saksa', area: 'Mosel', name: 'Saksa – Mosel', ratings: { '2020': 17 } }]
		});
		expect(() => validateVintageDocument(doc)).toThrow(/at least 2 regions/);
	});

	it('rejects an empty area name', () => {
		const doc = baseDoc();
		doc.regions[0].area = '  ';
		expect(() => validateVintageDocument(doc)).toThrow(/empty area name/);
	});

	it('rejects a duplicate region (same country + area)', () => {
		const doc = baseDoc();
		doc.regions[1].country = 'Saksa';
		doc.regions[1].area = 'mosel';
		expect(() => validateVintageDocument(doc)).toThrow(/Duplicate region/);
	});

	it('rejects a score above 20', () => {
		const doc = baseDoc();
		doc.regions[0].ratings['2022'] = 21;
		expect(() => validateVintageDocument(doc)).toThrow(/outside the expected 0-20 range/);
	});

	it('rejects a score below 0', () => {
		const doc = baseDoc();
		doc.regions[0].ratings['2022'] = -1;
		expect(() => validateVintageDocument(doc)).toThrow(/outside the expected 0-20 range/);
	});

	it('rejects an implausible year', () => {
		const doc = baseDoc();
		doc.regions[0].ratings['1500'] = 15;
		expect(() => validateVintageDocument(doc)).toThrow(/implausible vintage year/);
	});

	it('rejects a region with no ratings', () => {
		const doc = baseDoc({
			regions: [
				{ country: 'Saksa', area: 'Mosel', name: 'Saksa – Mosel', ratings: { '2020': 17 } },
				{ country: null, area: 'Empty', name: 'Empty', ratings: {} }
			]
		});
		expect(() => validateVintageDocument(doc)).toThrow(/no ratings at all/);
	});
});

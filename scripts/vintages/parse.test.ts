import { describe, expect, it } from 'bun:test';
import path from 'node:path';
import { extractText } from './extract.ts';
import { parseVintageDocument } from './parse.ts';
import { validateVintageDocument } from './validate.ts';
import type { ParsedVintageDocument } from './types.ts';

const FIXTURE_PATH = path.join(import.meta.dir, '__fixtures__', 'de-at-hu-white.pdf');

async function parseFixture(): Promise<ParsedVintageDocument> {
	const bytes = new Uint8Array(await Bun.file(FIXTURE_PATH).arrayBuffer());
	const extracted = await extractText(bytes);
	const parsed = parseVintageDocument(extracted, {
		source: 'https://example.test/de-at-hu-white.pdf',
		title: 'Saksan, Itävallan ja Unkarin valkoviinit - vuosikertataulukko',
		wineType: 'valkoviinit'
	});
	return validateVintageDocument(parsed);
}

describe('parseVintageDocument (German/Austrian/Hungarian white wine fixture)', () => {
	it('extracts a usable text layer', async () => {
		const bytes = new Uint8Array(await Bun.file(FIXTURE_PATH).arrayBuffer());
		const extracted = await extractText(bytes);
		expect(extracted.hasTextLayer).toBe(true);
		expect(extracted.pages.length).toBe(2);
	});

	it('parses all 9 region columns', async () => {
		const doc = await parseFixture();
		const names = doc.regions.map((r) => r.name).sort();
		expect(names).toEqual(
			[
				'Itävalta – Burg',
				'Itävalta – Nieder',
				'Itävalta – Steier',
				'Saksa – Baden/Franken',
				'Saksa – Mosel',
				'Saksa – RG',
				'Saksa – Nahe, RH, Pfalz',
				'Unkari',
				'Unkari – Tokaji'
			].sort()
		);
	});

	it('separates country and area for a subdivided region', async () => {
		const doc = await parseFixture();
		const mosel = doc.regions.find((r) => r.name === 'Saksa – Mosel');
		expect(mosel).toBeDefined();
		expect(mosel!.country).toBe('Saksa');
		expect(mosel!.area).toBe('Mosel');
		expect(mosel!.ratings['2020']).toBe(17);
		expect(mosel!.ratings['2021']).toBe(19);
		expect(mosel!.ratings['2022']).toBe(17);
		expect(mosel!.ratings['2023']).toBe(18);
		expect(mosel!.ratings['2024']).toBe(16);
	});

	it('leaves country null for a region that is not subdivided', async () => {
		const doc = await parseFixture();
		const hungary = doc.regions.find((r) => r.name === 'Unkari');
		expect(hungary).toBeDefined();
		expect(hungary!.country).toBeNull();
		expect(hungary!.area).toBe('Unkari');
	});

	it('does not include ratings for years before a region had data', async () => {
		const doc = await parseFixture();
		const burg = doc.regions.find((r) => r.name === 'Itävalta – Burg');
		expect(burg).toBeDefined();
		expect(burg!.ratings['1959']).toBeUndefined();
		expect(burg!.ratings['2001']).toBe(16);
	});

	it('every score is an integer between 0 and 20', async () => {
		const doc = await parseFixture();
		for (const region of doc.regions) {
			for (const score of Object.values(region.ratings)) {
				expect(Number.isInteger(score)).toBe(true);
				expect(score).toBeGreaterThanOrEqual(0);
				expect(score).toBeLessThanOrEqual(20);
			}
		}
	});
});

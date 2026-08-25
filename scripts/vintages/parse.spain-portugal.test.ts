import { describe, expect, it } from 'bun:test';
import path from 'node:path';
import { extractText } from './extract.ts';
import { parseVintageDocument } from './parse.ts';
import { validateVintageDocument } from './validate.ts';

const FIXTURE_PATH = path.join(import.meta.dir, '__fixtures__', 'es-pt-white.pdf');

describe('parseVintageDocument (Spain/Portugal white wine fixture)', () => {
	it('gives an unsubdivided country (Portugali) its own region with no separate area header', async () => {
		const bytes = new Uint8Array(await Bun.file(FIXTURE_PATH).arrayBuffer());
		const extracted = await extractText(bytes);
		const parsed = parseVintageDocument(extracted, {
			source: 'https://example.test/es-pt-white.pdf',
			title: 'Espanjan ja Portugalin valkoviinit - vuosikertataulukko',
			wineType: 'valkoviinit'
		});
		const doc = validateVintageDocument(parsed);

		const portugal = doc.regions.find((r) => r.area === 'Portugali');
		expect(portugal).toBeDefined();
		expect(portugal!.country).toBeNull();
		expect(portugal!.name).toBe('Portugali');
		expect(Object.keys(portugal!.ratings).length).toBeGreaterThan(0);

		const galicia = doc.regions.find((r) => r.area === 'Galicia');
		expect(galicia).toBeDefined();
		expect(galicia!.country).toBe('Espanja');
		expect(galicia!.name).toBe('Espanja – Galicia');
	});
});

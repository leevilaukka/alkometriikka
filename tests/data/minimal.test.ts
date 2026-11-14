import { describe, expect, it } from 'bun:test';
import { LEGACY_HEADERS } from '../../scripts/data/constants';
import { MINIMAL_COLUMNS, buildMinimalDataset } from '../../scripts/data/minimal';

function product(fields: Record<string, unknown>, removed = false) {
	const values: unknown[] = Array(LEGACY_HEADERS.length).fill(null);
	for (const [column, value] of Object.entries(fields)) {
		values[LEGACY_HEADERS.indexOf(column as (typeof LEGACY_HEADERS)[number])] = value;
	}
	return {
		values,
		priceHistory: [{ date: '2026-01-01', price: 1 }],
		meta: removed ? { removedFromSelection: '2026-07-14' } : undefined
	};
}

function minimalRow(data: ReturnType<typeof buildMinimalDataset>, id: string) {
	const row = data.products[id]?.values;
	return row && Object.fromEntries(MINIMAL_COLUMNS.map((column, i) => [column, row[i]]));
}

describe('buildMinimalDataset', () => {
	const result = buildMinimalDataset({
		schema: [...LEGACY_HEADERS],
		metadata: { LastUpdated: '2026-11-10T03:39:38.508Z' },
		products: {
			'1': product({
				Numero: '1',
				Nimi: 'Olut 6-pack',
				Pullokoko: 0.33,
				Hinta: 9.5,
				'Alkoholi-%': 4.7,
				Tyyppi: 'Panimotuotteet',
				Alatyyppi: 'oluet',
				EAN: '6410000000000',
				'Energia kcal/100 ml': 0,
				Luonnehdinta: ['maltainen'],
				Hinnastojärjestyskoodi: 'x'
			}),
			// Legacy price list formats: numbers as strings, old Tyyppi
			'2': product(
				{
					Numero: '2',
					Nimi: 'Vanha olut',
					Pullokoko: '0.5 l',
					Hinta: '2.50',
					'Alkoholi-%': '5.2',
					Tyyppi: 'oluet',
					Alatyyppi: '',
					'Energia kcal/100 ml': '45.0'
				},
				true
			),
			'3': product({ Numero: '3', Nimi: 'Ei prosenttia', Pullokoko: 0.5 }),
			'4': product({
				Numero: '4',
				Nimi: 'Kivennäisvesi',
				Pullokoko: 0.5,
				Hinta: 1,
				'Alkoholi-%': 0,
				Tyyppi: 'Alkoholittomat',
				'Energia kcal/100 ml': 0
			})
		}
	});

	it('keeps only the bot columns, with no history or metadata beyond LastUpdated', () => {
		expect(result.schema).toEqual([...MINIMAL_COLUMNS]);
		expect(result.metadata).toEqual({ LastUpdated: '2026-11-10T03:39:38.508Z' });
		expect(Object.keys(result.products['1'])).toEqual(['values']);
		expect(result.products['1'].values).toHaveLength(MINIMAL_COLUMNS.length);
		expect(MINIMAL_COLUMNS).not.toContain('Luonnehdinta');
	});

	it('skips products without an ABV and keeps alcohol-free ones', () => {
		expect(result.products['3']).toBeUndefined();
		expect(minimalRow(result, '4')).toMatchObject({ 'Alkoholi-%': 0, 'Energia kcal/100 ml': 0 });
	});

	it('turns legacy strings into numbers and empty strings into null', () => {
		expect(minimalRow(result, '2')).toMatchObject({
			Pullokoko: 0.5,
			Hinta: 2.5,
			'Alkoholi-%': 5.2,
			'Energia kcal/100 ml': 45,
			Alatyyppi: null
		});
	});

	it('uses null, not 0, for unknown energy in alcoholic drinks', () => {
		expect(minimalRow(result, '1')?.['Energia kcal/100 ml']).toBeNull();
	});

	it("maps a removed product's old Tyyppi onto the current one", () => {
		expect(minimalRow(result, '2')?.Tyyppi).toBe('Panimotuotteet');
		expect(minimalRow(result, '1')?.Tyyppi).toBe('Panimotuotteet');
	});
});

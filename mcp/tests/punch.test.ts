import { describe, expect, it } from 'bun:test';
import { decodePunch } from '../../src/lib/utils/catalog/punch.ts';
import { ToolInputError } from '../catalog.ts';
import { fixtureCatalog } from './helpers.ts';

const catalog = fixtureCatalog();
const booliParam = (url: string) => new URL(url).searchParams.get('booli')!;

describe('createPunchLink', () => {
	it('encodes a recipe the site can read, with Alko and custom ingredients', () => {
		const result = catalog.createPunchLink(
			' Juhannusbooli ',
			[
				{ product_id: '200002', count: 2 },
				{ name: 'Sitruunalimu', volume_l: 1.5, abv: 0, price_eur: 1.89, count: 4 }
			],
			{ glass_l: 0.25, people: 10 }
		);
		expect(result.url.startsWith('https://alkometriikka.fi/boolilaskuri/?booli=')).toBe(true);

		expect(decodePunch(booliParam(result.url))).toEqual({
			name: 'Juhannusbooli',
			glass: 0.25,
			people: 10,
			ingredients: [
				{ kind: 'alko', id: '200002', count: 2 },
				{ kind: 'custom', name: 'Sitruunalimu', volume: 1.5, abv: 0, price: 1.89, count: 4 }
			]
		});
		expect(result.ingredients.map((i) => i.product_id)).toEqual(['200002', null]);
		expect(result.totals.volume_l).toBeGreaterThan(6);
		expect(result.totals.price_eur).toBeGreaterThan(7.56);
	});

	it('uses defaults and accepts dropped leading zeros', () => {
		const result = catalog.createPunchLink('', [{ product_id: '8003' }]);
		expect(result.glass_l).toBe(0.2);
		expect(result.people).toBe(1);
		expect(decodePunch(booliParam(result.url))!.ingredients).toEqual([
			{ kind: 'alko', id: '008003', count: 1 }
		]);
	});

	it('fails without a link for unknown products', () => {
		expect(() => catalog.createPunchLink('X', [{ product_id: '999999' }])).toThrow(ToolInputError);
	});
});

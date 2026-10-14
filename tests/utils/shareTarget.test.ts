import { describe, expect, test } from 'bun:test';
import { shareDestination } from '../../src/lib/utils/shareTarget';

describe('shareDestination', () => {
	test('opens the product an Alko link points to, from any field', () => {
		expect(
			shareDestination({ url: 'https://www.alko.fi/tuotteet/319027/Koskenkorva-Viina/' })
		).toEqual({
			productId: '319027'
		});
		expect(
			shareDestination({
				title: 'Alko',
				text: 'Katso tämä https://www.alko.fi/fi/tuotteet/959618/karhu-iii'
			})
		).toEqual({ productId: '959618' });
		expect(shareDestination({ url: 'https://www.alko.fi/en/products/100001/' })).toEqual({
			productId: '100001'
		});
		expect(shareDestination({ url: 'https://alkometriikka.fi/tuotteet/900960/' })).toEqual({
			productId: '900960'
		});
	});

	test('searches the shared words when there is no product link', () => {
		expect(
			shareDestination({ title: 'Koskenkorva Viina | Alko', url: 'https://www.alko.fi/' })
		).toEqual({
			query: 'Koskenkorva Viina'
		});
		expect(shareDestination({ text: 'karhu https://example.com/x' })).toEqual({ query: 'karhu' });
		expect(shareDestination({})).toEqual({ query: '' });
	});
});

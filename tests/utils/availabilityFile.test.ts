import { describe, expect, it } from 'bun:test';
import { encodeStockedStores, readStockedStores } from '$lib/utils/catalog/availabilityFile';

describe('encodeStockedStores', () => {
	it('round-trips each product’s stores in numeric store order', () => {
		const product = {
			'1': ['2102', '5016', '10'],
			'2': [],
			'3': ['10'],
			// More than eight stores, so bitmaps span bytes
			'4': Array.from({ length: 20 }, (_, i) => String(100 + i))
		};
		const encoded = encodeStockedStores(product);
		expect(encoded.storeIds.slice(0, 3)).toEqual(['10', '100', '101']);
		expect(encoded.product['2']).toBe('');
		expect(readStockedStores(encoded)).toEqual({
			'1': ['10', '2102', '5016'],
			'2': [],
			'3': ['10'],
			'4': product['4']
		});
	});

	it('cuts trailing empty bytes', () => {
		const ids = Array.from({ length: 64 }, (_, i) => String(i));
		const { product } = encodeStockedStores({ all: ids, first: ['0'] });
		expect(atob(product.first)).toHaveLength(1);
		expect(atob(product.all)).toHaveLength(8);
	});
});

describe('readStockedStores', () => {
	it('reads the earlier format with a list of store ids per product', () => {
		expect(readStockedStores({ product: { '1': ['a'], '2': 'a', '3': ['a', 7] } })).toEqual({
			'1': ['a']
		});
	});

	it('drops bitmaps that are malformed or point past the store list', () => {
		const storeIds = ['a', 'b'];
		expect(
			readStockedStores({ storeIds, product: { ok: btoa('\x03'), bad: '!!', past: btoa('\x04') } })
		).toEqual({ ok: ['a', 'b'] });
	});

	it('returns null without a product map or with a malformed store list', () => {
		expect(readStockedStores({})).toBeNull();
		expect(readStockedStores({ storeIds: [1], product: {} })).toBeNull();
	});
});

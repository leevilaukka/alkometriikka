import { expect, test } from 'bun:test';
import { mergeHistoricalPrices, readHistoricalPrices } from '../../scripts/data/historical-prices';
import type { StoredDataset } from '../../src/lib/utils/catalog/dataset';
import { updatePriceHistory } from '../../scripts/data/lifecycle';

test('verified archive merges into the current catalog without restoring captured current values', async () => {
	const archive = await readHistoricalPrices();
	const source = archive.dataset.products!['319027'];
	const values = [...source.values];
	values[(archive.dataset.schema as string[]).indexOf('Hinta')] = 99;
	const live = { date: '2026-10-21', price: 99, normalPrice: 100, campaignStart: '2026-10-20' };
	const dataset: StoredDataset = {
		schema: archive.dataset.schema,
		metadata: { LastSynced: '2026-10-21' },
		products: {
			'319027': { values, priceHistory: [live], meta: { removedFromSelection: '2026-10-21' } }
		}
	};
	const report = mergeHistoricalPrices(dataset, archive.dataset, archive.report);
	expect(report.products).toHaveLength(1);
	expect(dataset.products!['319027'].values).toEqual(values);
	expect(dataset.products!['319027'].priceHistory!.at(-1)).toEqual(live);
	expect(dataset.products!['319027'].meta?.removedFromSelection).toBe('2026-10-21');
	expect(report.products[0].price).toBe(99);
	expect(report.products[0].removed).toBe(true);
	const once = JSON.stringify(dataset);
	mergeHistoricalPrices(dataset, archive.dataset, archive.report);
	expect(JSON.stringify(dataset)).toBe(once);
	// A recovered range overlapping the live baseline must not replace it.
	const earliest = dataset.products!['319027'].priceHistory![0];
	dataset.products!['319027'].priceHistory = [{ date: earliest.date, price: 42 }];
	mergeHistoricalPrices(dataset, archive.dataset, archive.report);
	expect(dataset.products!['319027'].priceHistory).toEqual([{ date: earliest.date, price: 42 }]);
	dataset.products!['319027'].priceHistory = [live];
	values[(archive.dataset.schema as string[]).indexOf('Pullokoko')] = 8;
	expect(mergeHistoricalPrices(dataset, archive.dataset, archive.report).products).toHaveLength(0);
	expect(dataset.products!['319027'].priceHistory).toEqual([live]);
});

test('archive-only history never suppresses the first live observation', () => {
	const historical = {
		date: '2007-05-11',
		price: 10,
		archive: { sourceId: 'x', lastSourceId: 'x', lastObserved: '2007-05-11', observations: 1 }
	};
	expect(updatePriceHistory([historical], 10, null)).toHaveLength(2);
});

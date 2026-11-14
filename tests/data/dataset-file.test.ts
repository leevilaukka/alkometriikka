import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	HASH_VERSION,
	LEGACY_HEADERS,
	alignValues,
	getHash,
	getHashValues
} from '../../scripts/data/constants';
import {
	mergeHashes,
	readDataset,
	splitHashes,
	writeDataset
} from '../../scripts/data/dataset-file';
import { isMigratedProduct } from '../../scripts/data/guards';
import type { MigratedData } from '../../scripts/data/types';
import { parseDataset, parseRemovedProducts } from '$lib/utils/catalog/dataset';

function values(id: string): unknown[] {
	const row: unknown[] = Array(LEGACY_HEADERS.length).fill(null);
	row[LEGACY_HEADERS.indexOf('Numero')] = id;
	row[LEGACY_HEADERS.indexOf('Nimi')] = `Tuote ${id}`;
	row[LEGACY_HEADERS.indexOf('Hinta')] = 10;
	row[LEGACY_HEADERS.indexOf('Pullokoko')] = 0.5;
	row[LEGACY_HEADERS.indexOf('Alkoholi-%')] = 5;
	row[LEGACY_HEADERS.indexOf('Tyyppi')] = 'oluet';
	return row;
}

function dataset(): MigratedData {
	return {
		schema: LEGACY_HEADERS,
		metadata: { LastUpdated: '2026-10-01', LastSynced: '2026-10-01', HashVersion: HASH_VERSION },
		products: {
			'1': {
				hash: 'hash-1',
				values: values('1'),
				priceHistory: [{ date: '2026-09-01', price: 10 }]
			},
			'2': {
				hash: 'hash-2',
				values: values('2'),
				priceHistory: [],
				meta: { removedFromSelection: '2026-09-30', detailCheckedAt: '2026-09-15' }
			},
			'3': {
				hash: 'hash-3',
				values: values('3'),
				priceHistory: [],
				meta: { detailCheckedAt: '2026-09-20', detailFailedAt: '2026-09-25' }
			}
		}
	};
}

let dir: string;
let dataPath: string;
let hashesPath: string;
beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'dataset-file-'));
	dataPath = join(dir, 'data.json');
	hashesPath = join(dir, 'hashes.json');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('dataset file with separate hashes', () => {
	it('writes data.json without hashes and reads the same dataset back', async () => {
		await writeDataset(dataset(), dataPath, hashesPath);

		const written = await Bun.file(dataPath).json();
		for (const product of Object.values(written.products) as Record<string, unknown>[])
			expect(product).not.toHaveProperty('hash');
		expect(Object.keys(written.products)).toEqual(['1', '3']);
		expect(written.products['3']).not.toHaveProperty('meta');
		expect(written.removedProducts).toBe(1);
		const removed = await Bun.file(join(dir, 'data-removed.json')).json();
		expect(Object.keys(removed.products)).toEqual(['2']);
		expect(removed.products['2'].meta).toEqual({ removedFromSelection: '2026-09-30' });
		expect(written.index).toBeDefined();
		expect(await Bun.file(hashesPath).json()).toEqual({
			HashVersion: HASH_VERSION,
			hashes: { '1': 'hash-1', '2': 'hash-2', '3': 'hash-3' },
			detailCheckedAt: { '2': '2026-09-15', '3': '2026-09-20' },
			detailFailedAt: { '3': '2026-09-25' }
		});

		const read = await readDataset(dataPath, hashesPath);
		const { index: _index, ...withoutIndex } = read as MigratedData & { index?: unknown };
		expect(withoutIndex).toEqual(dataset());
	});

	it('keeps data.json and data-removed.json readable by the app', async () => {
		await writeDataset(dataset(), dataPath, hashesPath);
		const { table, schema, removedProducts } = parseDataset(await Bun.file(dataPath).text());
		expect(table).toHaveLength(3);
		expect(removedProducts).toBe(1);
		const rows = parseRemovedProducts(
			await Bun.file(join(dir, 'data-removed.json')).text(),
			schema
		);
		expect(rows?.map((row) => row[0])).toEqual(['2']);
	});

	it('stores word columns as indexes and reads the words back', async () => {
		const data = dataset();
		const notes = LEGACY_HEADERS.indexOf('Luonnehdinta');
		const pairings = LEGACY_HEADERS.indexOf('Ruokasuositukset');
		data.products!['1'].values[notes] = ['keltainen', 'makea'];
		data.products!['3'].values[notes] = ['makea', 'punainen'];
		data.products!['1'].values[pairings] = ['Kala', 'Äyriäiset'];
		await writeDataset(data, dataPath, hashesPath);

		const written = await Bun.file(dataPath).json();
		expect(written.dictionaries.Luonnehdinta).toEqual(['keltainen', 'makea', 'punainen']);
		expect(written.products['3'].values[notes]).toEqual([1, 2]);
		expect(written.products['1'].values[pairings]).toEqual([0, 1]);

		const read = await readDataset(dataPath, hashesPath);
		expect(read!.products!['3'].values[notes]).toEqual(['makea', 'punainen']);
		expect(read!.products!['1'].values[pairings]).toEqual(['Kala', 'Äyriäiset']);
	});

	it('refuses a dataset whose removed products file is missing or short', async () => {
		await writeDataset(dataset(), dataPath, hashesPath);
		const removedPath = join(dir, 'data-removed.json');
		const removed = await Bun.file(removedPath).json();

		await Bun.write(removedPath, JSON.stringify({ ...removed, products: {} }));
		await expect(readDataset(dataPath, hashesPath)).rejects.toThrow('lists 1 removed products');

		rmSync(removedPath);
		await expect(readDataset(dataPath, hashesPath)).rejects.toThrow('none readable');
	});

	it('reads a dataset written before the split, with hashes inline', async () => {
		await Bun.write(dataPath, JSON.stringify(dataset()));
		expect(await readDataset(dataPath, hashesPath)).toEqual(dataset());
	});

	it('recomputes hashes from stored values when hashes.json is missing, keeping every product', async () => {
		const silence = spyOn(console, 'warn').mockImplementation(() => {});
		await Bun.write(dataPath, JSON.stringify(splitHashes(dataset()).data));
		const read = await readDataset(dataPath, hashesPath);
		silence.mockRestore();

		for (const id of ['1', '2', '3']) {
			expect(isMigratedProduct(read!.products![id])).toBe(true);
			expect(read!.products![id].hash).toBe(getHash(getHashValues(alignValues(values(id)))));
		}
		// History and removal flags survive
		expect(read!.products!['1'].priceHistory).toHaveLength(1);
		expect(read!.products!['2'].meta?.removedFromSelection).toBe('2026-09-30');
	});

	it('ignores hashes written under another hash version', () => {
		const { data, hashes } = splitHashes(dataset());
		const counts = mergeHashes(data, { ...hashes, HashVersion: HASH_VERSION + 1 });
		expect(counts).toEqual({ inline: 0, file: 0, recomputed: 3 });
		// Detail check dates don't depend on the hash version
		expect(data.products!['3'].meta).toEqual({
			detailCheckedAt: '2026-09-20',
			detailFailedAt: '2026-09-25'
		});
	});

	it('prefers inline hashes, then the hashes file', () => {
		const data = dataset();
		delete (data.products!['2'] as { hash?: string }).hash;
		const counts = mergeHashes(data, {
			HashVersion: HASH_VERSION,
			hashes: { '1': 'x', '2': 'from-file' }
		});
		expect(counts).toEqual({ inline: 2, file: 1, recomputed: 0 });
		expect(data.products!['1'].hash).toBe('hash-1');
		expect(data.products!['2'].hash).toBe('from-file');
	});

	it('returns null when there is no dataset', async () => {
		expect(await readDataset(dataPath, hashesPath)).toBeNull();
	});
});

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
import { parseDataset } from '$lib/utils/dataset';

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
				meta: { removedFromSelection: '2026-09-30' }
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
		expect(written.index).toBeDefined();
		expect(await Bun.file(hashesPath).json()).toEqual({
			HashVersion: HASH_VERSION,
			hashes: { '1': 'hash-1', '2': 'hash-2' }
		});

		const read = await readDataset(dataPath, hashesPath);
		const { index: _index, ...withoutIndex } = read as MigratedData & { index?: unknown };
		expect(withoutIndex).toEqual(dataset());
	});

	it('keeps data.json readable by the app', async () => {
		await writeDataset(dataset(), dataPath, hashesPath);
		const { table } = parseDataset(await Bun.file(dataPath).text());
		expect(table).toHaveLength(3);
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

		for (const id of ['1', '2']) {
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
		expect(counts).toEqual({ inline: 0, file: 0, recomputed: 2 });
	});

	it('prefers inline hashes, then the hashes file', () => {
		const data = dataset();
		delete (data.products!['2'] as { hash?: string }).hash;
		const counts = mergeHashes(data, {
			HashVersion: HASH_VERSION,
			hashes: { '1': 'x', '2': 'from-file' }
		});
		expect(counts).toEqual({ inline: 1, file: 1, recomputed: 0 });
		expect(data.products!['1'].hash).toBe('hash-1');
		expect(data.products!['2'].hash).toBe('from-file');
	});

	it('returns null when there is no dataset', async () => {
		expect(await readDataset(dataPath, hashesPath)).toBeNull();
	});
});

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { packDataset } from '../../src/lib/utils/catalog/datasetFile.ts';
import { CatalogProvider } from '../provider.ts';
import { FIXTURE_DIR, quietly } from './helpers.ts';

let dir: string;

beforeAll(() => {
	dir = mkdtempSync(join(tmpdir(), 'mcp-provider-'));
	const dataset = JSON.parse(readFileSync(join(FIXTURE_DIR, 'data.json'), 'utf8'));
	const { data, removed } = packDataset(dataset);
	writeFileSync(join(dir, 'data.json'), JSON.stringify(data));
	writeFileSync(join(dir, 'data-removed.json'), JSON.stringify(removed));
	writeFileSync(
		join(dir, 'availability.json'),
		readFileSync(join(FIXTURE_DIR, 'availability.json'))
	);
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

const options = (localDir: string) => ({
	baseUrl: 'https://example.test',
	cacheDir: join(localDir, 'cache'),
	localDir,
	ttlMs: 0,
	retryAfterFailureMs: 0,
	timeoutMs: 1000,
	userAgent: 'test'
});

describe('CatalogProvider', () => {
	it('includes products removed from the selection from data-removed.json', async () => {
		const catalog = await quietly(() => new CatalogProvider(options(dir)).get());
		const all = JSON.parse(readFileSync(join(FIXTURE_DIR, 'data.json'), 'utf8')).products;
		const removedIds = Object.entries(all)
			.filter(([, p]: any) => p.meta?.removedFromSelection)
			.map(([id]) => id);
		expect(removedIds.length).toBeGreaterThan(0);
		for (const id of removedIds) expect(catalog.findProduct(id)).toBeDefined();
		expect(catalog.status.warnings).toBeUndefined();
	});

	it('serves the selection with a warning when data-removed.json is missing', async () => {
		const bare = mkdtempSync(join(tmpdir(), 'mcp-provider-bare-'));
		try {
			for (const name of ['data.json', 'availability.json'])
				writeFileSync(join(bare, name), readFileSync(join(dir, name)));
			const catalog = await quietly(() => new CatalogProvider(options(bare)).get());
			expect(catalog.status.warnings?.join(' ')).toContain('removed from the selection');
		} finally {
			rmSync(bare, { recursive: true, force: true });
		}
	});
});

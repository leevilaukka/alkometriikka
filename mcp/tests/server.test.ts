import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DataUnavailableError } from '../data-store.ts';
import { createServer, type CatalogSource } from '../server.ts';
import { FIXTURE_DIR, fixtureCatalog } from './helpers.ts';

const TOOLS = [
	'catalog_statistics',
	'compare_products',
	'create_list_link',
	'get_product',
	'list_filter_values',
	'price_history',
	'search_products',
	'store_availability'
];

async function connect(source: CatalogSource) {
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	const client = new Client({ name: 'test', version: '1.0.0' });
	await createServer(source).connect(serverTransport);
	await client.connect(clientTransport);
	return client;
}

const call = async (client: Client, name: string, args: Record<string, unknown> = {}) =>
	(await client.callTool({ name, arguments: args })) as CallToolResult;

const errorText = (result: CallToolResult) => {
	expect(result.isError).toBe(true);
	return result.content.map((part) => (part.type === 'text' ? part.text : '')).join('');
};

describe('MCP server (in-memory)', () => {
	const catalog = fixtureCatalog();
	let client: Client;

	beforeAll(async () => {
		client = await connect({ get: async () => catalog });
	});
	afterAll(async () => {
		await client.close();
	});

	it('registers the read-only tools with schemas', async () => {
		const { tools } = await client.listTools();
		expect(tools.map((tool) => tool.name).sort()).toEqual(TOOLS);
		for (const tool of tools) {
			expect(tool.description?.length).toBeGreaterThan(50);
			expect(tool.inputSchema.type).toBe('object');
			expect(tool.outputSchema?.type).toBe('object');
			expect(tool.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
		}
	});

	it('provides server instructions', () => {
		expect(client.getInstructions()).toContain('Alko');
	});

	it('searches products with structured results', async () => {
		const result = await call(client, 'search_products', { query: 'testilager' });
		expect(result.isError).toBeFalsy();
		const structured = result.structuredContent as {
			total_matches: number;
			products: { id: string }[];
		};
		expect(structured.total_matches).toBe(1);
		expect(structured.products[0]!.id).toBe('200002');
		const text = result.content[0];
		expect(text?.type === 'text' && JSON.parse(text.text)).toEqual(structured);
	});

	it('creates list links through the protocol', async () => {
		const result = await call(client, 'create_list_link', {
			name: 'Sauna',
			items: [{ product_id: '200002', quantity: 6 }]
		});
		expect(result.isError).toBeFalsy();
		expect(result.structuredContent).toMatchObject({
			name: 'Sauna',
			totals: { items: 6 },
			products: [{ id: '200002', quantity: 6 }]
		});
		expect(
			errorText(
				await call(client, 'create_list_link', {
					name: 'X',
					items: [{ product_id: '200002', quantity: 0 }]
				})
			)
		).toContain('quantity');
	});

	it('returns empty search results without an error', async () => {
		const result = await call(client, 'search_products', { query: 'zzqqxx' });
		expect(result.isError).toBeFalsy();
		expect(result.structuredContent).toMatchObject({ total_matches: 0, products: [] });
	});

	it('gets a product', async () => {
		const result = await call(client, 'get_product', { product_id: '300003' });
		expect(result.isError).toBeFalsy();
		expect(result.structuredContent).toMatchObject({
			product: { id: '300003', name: 'Château Testi 2022', metrics: { alcohol_grams: 79.89 } }
		});
	});

	it('runs the other tools', async () => {
		for (const [name, args] of [
			['compare_products', { product_ids: ['100001', '300003'] }],
			['price_history', { product_id: '100001' }],
			['store_availability', { product_id: '100001', city: 'Helsinki' }],
			['catalog_statistics', {}],
			['catalog_statistics', { category: 'Viinit' }],
			['list_filter_values', { field: 'store' }]
		] as const) {
			const result = await call(client, name, args);
			expect(result.isError, `${name} failed: ${JSON.stringify(result.content)}`).toBeFalsy();
			expect(result.structuredContent).toHaveProperty('dataset');
		}
	});

	it('reports unknown product IDs as tool errors', async () => {
		expect(errorText(await call(client, 'get_product', { product_id: '999999' }))).toContain(
			'No product with ID "999999"'
		);
		expect(errorText(await call(client, 'price_history', { product_id: 'abc' }))).toContain(
			'not a valid product ID'
		);
	});

	it('reports invalid arguments as tool errors', async () => {
		expect(errorText(await call(client, 'search_products', { limit: 1000 }))).toContain(
			'Input validation error'
		);
		expect(errorText(await call(client, 'compare_products', { product_ids: ['1'] }))).toContain(
			'Input validation error'
		);
		expect(errorText(await call(client, 'search_products', { country: ['Atlantis'] }))).toContain(
			'No country matches "Atlantis"'
		);
	});

	it('reports data loading failures as tool errors', async () => {
		const failing = await connect({
			get: async () => {
				throw new DataUnavailableError('Could not download https://alkometriikka.fi/data.json');
			}
		});
		expect(errorText(await call(failing, 'search_products', { query: 'x' }))).toContain(
			'Could not download'
		);
		await failing.close();
	});
});

describe('MCP server (stdio)', () => {
	it('starts, keeps stdout clean and answers tool calls', async () => {
		const cacheDir = mkdtempSync(join(tmpdir(), 'alkometriikka-mcp-stdio-'));
		const transport = new StdioClientTransport({
			command: process.execPath,
			args: [join(import.meta.dir, '..', 'index.ts')],
			env: {
				PATH: process.env.PATH ?? '',
				ALKOMETRIIKKA_DATA_DIR: FIXTURE_DIR,
				ALKOMETRIIKKA_CACHE_DIR: cacheDir
			},
			stderr: 'pipe'
		});
		const client = new Client({ name: 'stdio-test', version: '1.0.0' });
		try {
			await client.connect(transport);
			expect(client.getServerVersion()?.name).toBe('alkometriikka');
			const { tools } = await client.listTools();
			expect(tools.map((tool) => tool.name).sort()).toEqual(TOOLS);

			const result = (await client.callTool({
				name: 'get_product',
				arguments: { product_id: '100001' }
			})) as CallToolResult;
			expect(result.isError).toBeFalsy();
			expect(result.structuredContent).toMatchObject({
				product: { id: '100001', name: 'Testiviina' },
				dataset: { source: FIXTURE_DIR }
			});
		} finally {
			await client.close();
			rmSync(cacheDir, { recursive: true, force: true });
		}
	}, 20_000);
});

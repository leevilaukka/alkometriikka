/**
 * MCP tool definitions for the Alkometriikka catalog. All tools are read-only
 * and only query the in-memory catalog built from the public data files.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import {
	COMPARE_MAX,
	FILTER_FIELDS,
	SEARCH_LIMIT_DEFAULT,
	SEARCH_LIMIT_MAX,
	SORT_KEYS,
	type Catalog,
	type FilterField,
	type SortKey
} from './catalog.ts';
import { SERVER_NAME, SERVER_VERSION } from './config.ts';

export type CatalogSource = { get(): Promise<Catalog> };

const INSTRUCTIONS = `Alkometriikka is an independent database of the Finnish alcohol retailer Alko's product catalog (not affiliated with Alko).
- Product data (names, categories, countries, etc.) is in Finnish, exactly as Alko publishes it, and filter values are Finnish. Products are classified as category (e.g. "Viinit" wines, "Väkevät" spirits, "Panimotuotteet" beers/ciders/long drinks, "Alkoholittomat" non-alcoholic) → subcategory (e.g. "Punaviinit" red wines, "Oluet" beers, "Viskit" whiskies) → style (e.g. "Lager", "Ipa"). Use list_filter_values when unsure of a value.
- Prices are in euros, volumes in liters. Product IDs are Alko product numbers (e.g. "319027").
- Typical flow: search_products → get_product / compare_products / price_history / store_availability.
- Every result includes a "dataset" block with update timestamps. Data is refreshed upstream about every 6 hours; mention staleness when "stale" is true or warnings are present.
- Store availability is a periodic snapshot without stock quantities; do not present it as live stock.`;

const READ_ONLY = {
	readOnlyHint: true,
	destructiveHint: false,
	idempotentHint: true,
	openWorldHint: false
} as const;

const datasetStatus = z
	.object({
		last_updated: z.string().nullable(),
		last_synced: z.string().nullable(),
		availability_last_updated: z.string().nullable(),
		downloaded_at: z.string().nullable(),
		source: z.string(),
		stale: z.boolean(),
		warnings: z.array(z.string()).optional()
	})
	.describe('Freshness of the underlying data');

const productSummary = z.looseObject({
	id: z.string(),
	name: z.string(),
	manufacturer: z.string().nullable(),
	category: z.string().nullable(),
	subcategory: z.string().nullable(),
	country: z.string().nullable(),
	bottle_size_l: z.number().nullable(),
	price_eur: z.number().nullable(),
	price_per_liter_eur: z.number().nullable(),
	alcohol_percentage: z.number().nullable(),
	alcohol_grams_per_euro: z.number().nullable(),
	euro_per_liter_alcohol: z.number().nullable(),
	sale_discount_percent: z.number().nullable(),
	removed_from_selection: z.boolean(),
	url: z.string()
});

const productId = z
	.string()
	.min(1)
	.max(200)
	.describe(
		'Alko product number, e.g. "319027" (an alko.fi or alkometriikka.fi product URL also works)'
	);

const stringList = (description: string) =>
	z.array(z.string().min(1).max(100)).max(20).optional().describe(description);

function result<T extends Record<string, unknown>>(structured: T): CallToolResult {
	return {
		content: [{ type: 'text', text: JSON.stringify(structured) }],
		structuredContent: structured
	};
}

export function createServer(source: CatalogSource): McpServer {
	const server = new McpServer(
		{ name: SERVER_NAME, version: SERVER_VERSION },
		{ instructions: INSTRUCTIONS }
	);

	server.registerTool(
		'search_products',
		{
			title: 'Search Alko products',
			description: `Search and filter the Alko product catalog. Use this to find products and their IDs by name, type, price, alcohol content, country, store, etc.

Text query matches product names (fuzzy, same as the alkometriikka.fi search box). Categorical filters are case-insensitive, accept several values (a product matches if it has ANY of them), and a partial value matches every value containing it (e.g. category "viini" matches all wine categories). Values are Finnish; call list_filter_values to discover them. grapes / taste_descriptors require the product to have ALL given values.

Products removed from Alko's selection are excluded unless include_removed is true. Returns at most ${SEARCH_LIMIT_MAX} compact product summaries per call (default ${SEARCH_LIMIT_DEFAULT}); use offset to page. Sorting defaults to relevance when a query is given, otherwise to alcohol_grams_per_euro (best alcohol value first). Use get_product for full details.`,
			inputSchema: {
				query: z
					.string()
					.max(200)
					.optional()
					.describe('Text to match in product names, e.g. "Koskenkorva"'),
				category: stringList(
					'Main category (Finnish): "Viinit" (wines), "Väkevät" (spirits), "Panimotuotteet" (beers, ciders, long drinks), "Alkoholittomat" (non-alcoholic), "Välituotteet" (fortified/intermediate)'
				),
				subcategory: stringList(
					'Subcategory (Finnish), e.g. ["Punaviinit"] (red wine), ["Oluet"] (beer), ["Siiderit"], ["Viskit"], ["Ginit"]'
				),
				style: stringList(
					'Style / taste profile (Finnish), e.g. beer styles ["Lager"], ["Ipa"], ["Stout & porter"], or wine styles like ["Pehmeä & hedelmäinen"]'
				),
				country: stringList('Country of origin (Finnish), e.g. ["Suomi"], ["Ranska"], ["Italia"]'),
				region: stringList('Region of origin, e.g. ["Bordeaux"]'),
				manufacturer: stringList('Manufacturer / producer name'),
				packaging: stringList(
					'Packaging type (Finnish), e.g. ["Tölkki"] (can), ["Pullo"], ["Hanapakkaus"] (bag-in-box)'
				),
				selection: stringList(
					'Alko selection type: "Vakiovalikoima" (standard), "Tilausvalikoima" (order-only), "Kausituote" (seasonal), "Erikoiserä" (special batch)'
				),
				grapes: stringList('Grape varieties the product must ALL contain, e.g. ["Pinot Noir"]'),
				taste_descriptors: stringList(
					'Taste descriptors the product must ALL have (Finnish), e.g. ["Hedelmäinen"]'
				),
				store: stringList(
					'Only products listed in ANY of these Alko stores. Accepts store IDs, store names or city names (a city matches all its stores), e.g. ["Tampere"]'
				),
				min_price: z.number().min(0).optional().describe('Minimum price in euros'),
				max_price: z.number().min(0).optional().describe('Maximum price in euros'),
				min_alcohol_percentage: z.number().min(0).max(100).optional(),
				max_alcohol_percentage: z.number().min(0).max(100).optional(),
				min_bottle_size_l: z.number().min(0).optional().describe('Minimum package size in liters'),
				max_bottle_size_l: z.number().min(0).optional().describe('Maximum package size in liters'),
				max_sugar_g_per_l: z
					.number()
					.min(0)
					.optional()
					.describe('Maximum sugar content in g/l (missing values count as 0)'),
				on_sale: z
					.boolean()
					.optional()
					.describe(
						'true: only products in an active sales campaign; false: only products not on sale'
					),
				include_removed: z
					.boolean()
					.optional()
					.describe('Include products no longer in Alko’s selection (default false)'),
				sort_by: z
					.enum(Object.keys(SORT_KEYS) as [SortKey, ...SortKey[]])
					.optional()
					.describe(
						'Sort key. Defaults: price, price_per_liter, euro_per_liter_alcohol, bottle_size and name ascending; alcohol_grams_per_euro and alcohol_percentage descending'
					),
				sort_order: z
					.enum(['asc', 'desc'])
					.optional()
					.describe('Override the default sort direction'),
				limit: z
					.number()
					.int()
					.min(1)
					.max(SEARCH_LIMIT_MAX)
					.optional()
					.describe(`Results per page (default ${SEARCH_LIMIT_DEFAULT})`),
				offset: z.number().int().min(0).optional().describe('Number of results to skip, for paging')
			},
			outputSchema: {
				total_matches: z.number(),
				offset: z.number(),
				returned: z.number(),
				has_more: z.boolean(),
				sort_by: z.string(),
				applied_filters: z
					.record(z.string(), z.unknown())
					.describe('Filters after resolving to exact dataset values'),
				products: z.array(productSummary),
				hint: z.string().optional(),
				dataset: datasetStatus
			},
			annotations: { title: 'Search Alko products', ...READ_ONLY }
		},
		async (args) => result((await source.get()).search(args))
	);

	server.registerTool(
		'get_product',
		{
			title: 'Get product details',
			description: `Get full details for one Alko product: price, size, alcohol %, €/L, taste descriptors, grapes, beer/sugar/energy values, active sale, calculated alcohol-value metrics (alcohol grams, grams per euro, € per liter of pure alcohol, standard drinks), a price history summary, the number of stores listing it, and links. Use search_products first if you do not know the product ID.`,
			inputSchema: { product_id: productId },
			outputSchema: {
				product: productSummary,
				metrics_note: z.string(),
				dataset: datasetStatus
			},
			annotations: { title: 'Get product details', ...READ_ONLY }
		},
		async ({ product_id }) => result((await source.get()).getProduct(product_id))
	);

	server.registerTool(
		'compare_products',
		{
			title: 'Compare products',
			description: `Compare 2–${COMPARE_MAX} products side by side on price, €/L, alcohol %, alcohol grams per euro, € per liter of pure alcohol and standard drinks, and report which product is best on each metric. IDs that are not found are listed in not_found instead of failing the whole call.`,
			inputSchema: {
				product_ids: z
					.array(productId)
					.min(2)
					.max(COMPARE_MAX)
					.describe(`2–${COMPARE_MAX} Alko product numbers`)
			},
			outputSchema: {
				products: z.array(productSummary),
				best: z.record(
					z.string(),
					z.object({ id: z.string(), name: z.string(), value: z.number() }).nullable()
				),
				not_found: z.array(z.string()),
				metrics_note: z.string(),
				dataset: datasetStatus
			},
			annotations: { title: 'Compare products', ...READ_ONLY }
		},
		async ({ product_ids }) => result((await source.get()).compare(product_ids))
	);

	server.registerTool(
		'price_history',
		{
			title: 'Product price history',
			description: `Get the recorded price history of a product: every price change Alkometriikka has observed (with sale-campaign details where applicable), plus a summary with the lowest/highest price and the change since tracking started. Use this for questions like "has this gotten more expensive?" or "is the current price a good deal?".`,
			inputSchema: {
				product_id: productId,
				limit: z
					.number()
					.int()
					.min(1)
					.max(500)
					.optional()
					.describe('Return only the most recent N entries (default: all)')
			},
			outputSchema: {
				product: productSummary,
				current_price_eur: z.number().nullable(),
				summary: z.looseObject({}).nullable(),
				history: z.array(
					z.object({
						date: z.string(),
						price_eur: z.number(),
						normal_price_eur: z.number().nullable(),
						campaign_start: z.string().nullable(),
						campaign_end: z.string().nullable()
					})
				),
				history_truncated: z.boolean(),
				note: z.string(),
				dataset: datasetStatus
			},
			annotations: { title: 'Product price history', ...READ_ONLY }
		},
		async ({ product_id, limit }) => result((await source.get()).priceHistory(product_id, limit))
	);

	server.registerTool(
		'store_availability',
		{
			title: 'Store availability',
			description: `List the Alko stores where a product was available at the last availability snapshot (refreshed about every 6 hours, no stock quantities), optionally narrowed to a city or store name. Includes today's opening hours. Always tell the user the data may be out of date and stock is not guaranteed; the response includes the snapshot time and limitations.`,
			inputSchema: {
				product_id: productId,
				city: z.string().max(100).optional().describe('Only stores in this city, e.g. "Helsinki"'),
				store: z
					.string()
					.max(100)
					.optional()
					.describe('Only stores whose name contains this text, or a store ID'),
				limit: z
					.number()
					.int()
					.min(1)
					.max(400)
					.optional()
					.describe('Maximum stores to list (default 25)')
			},
			outputSchema: {
				product: productSummary,
				selection: z.string().nullable(),
				availability_data_loaded: z.boolean(),
				available_store_count: z.number(),
				matching_store_count: z.number(),
				stores: z.array(
					z.object({
						store_id: z.string(),
						name: z.string(),
						city: z.string().nullable(),
						address: z.string().nullable(),
						postal_code: z.string().nullable(),
						opening_hours_today: z.string().nullable(),
						open_now: z.boolean()
					})
				),
				stores_truncated: z.boolean(),
				limitations: z.array(z.string()),
				dataset: datasetStatus
			},
			annotations: { title: 'Store availability', ...READ_ONLY }
		},
		async ({ product_id, city, store, limit }) =>
			result(
				(await source.get()).storeAvailability(product_id, { city, store, limit: limit ?? 25 })
			)
	);

	server.registerTool(
		'catalog_statistics',
		{
			title: 'Catalog statistics',
			description: `High-level statistics about the Alko catalog (or one category): product counts, products on sale, new products, average price / €/L / alcohol %, price range, category or subcategory breakdown, top countries, the best alcohol-per-euro products, and when the data was last updated. Useful for overview questions and for checking data freshness.`,
			inputSchema: {
				category: z
					.string()
					.max(100)
					.optional()
					.describe(
						'Limit statistics to one main category (Finnish), e.g. "Panimotuotteet" or "Viinit"'
					)
			},
			outputSchema: {
				scope: z.string(),
				product_count: z.number(),
				active_product_count: z.number(),
				removed_product_count: z.number(),
				on_sale_count: z.number(),
				new_product_count: z.number(),
				average_price_eur: z.number().nullable(),
				average_price_per_liter_eur: z.number().nullable(),
				average_alcohol_percentage: z.number().nullable(),
				price_range_eur: z.object({ min: z.number(), max: z.number() }).nullable(),
				categories: z.array(z.object({ name: z.string(), count: z.number() })).optional(),
				subcategories: z.array(z.object({ name: z.string(), count: z.number() })).optional(),
				top_countries: z.array(z.object({ name: z.string(), count: z.number() })),
				best_alcohol_value: z.array(z.looseObject({ id: z.string(), name: z.string() })),
				store_count: z.number(),
				note: z.string(),
				dataset: datasetStatus
			},
			annotations: { title: 'Catalog statistics', ...READ_ONLY }
		},
		async ({ category }) => result((await source.get()).statistics(category))
	);

	const filterFields = ['store', ...Object.keys(FILTER_FIELDS)] as [FilterField, ...FilterField[]];
	server.registerTool(
		'list_filter_values',
		{
			title: 'List filter values',
			description: `List the valid values of a search_products filter, with the number of products currently in the selection for each value. Values are Finnish, as in Alko's data. Use this before filtering when you are unsure of the exact value (e.g. which categories exist, how a country is spelled, or which stores are in a city).`,
			inputSchema: {
				field: z
					.enum(filterFields)
					.describe(
						'Filter to list; "grape" and "taste_descriptor" correspond to the grapes / taste_descriptors search filters'
					),
				contains: z
					.string()
					.max(100)
					.optional()
					.describe(
						'Only values containing this text (case-insensitive); for stores also matches the city'
					),
				limit: z
					.number()
					.int()
					.min(1)
					.max(500)
					.optional()
					.describe('Maximum values to return (default 100)')
			},
			outputSchema: {
				field: z.string(),
				total_values: z.number(),
				values: z.array(
					z.object({
						value: z.string(),
						count: z.number(),
						store_id: z.string().optional(),
						city: z.string().nullable().optional()
					})
				),
				truncated: z.boolean(),
				note: z.string(),
				dataset: datasetStatus
			},
			annotations: { title: 'List filter values', ...READ_ONLY }
		},
		async ({ field, contains, limit }) =>
			result((await source.get()).filterValues(field, contains, limit ?? 100))
	);

	return server;
}

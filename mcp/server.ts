/**
 * MCP tool definitions for the Alkometriikka catalog. All tools are read-only
 * and only query the in-memory catalog built from the public data files.
 */
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import {
	COMPARE_MAX,
	FILTER_FIELDS,
	LIST_ITEMS_MAX,
	LIST_QUANTITY_MAX,
	PUNCH_TEMPLATE_IDS,
	PUNCH_TEMPLATES_INFO,
	PUNCH_COUNT_MAX,
	PUNCH_INGREDIENTS_MAX,
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
- Typical flow: search_products → get_product / compare_products / price_history / store_availability. create_list_link turns chosen products into a shareable alkometriikka.fi list link, and create_punch_link a punch (booli) recipe into a link to the punch calculator (suggest_punch builds one from a template). Also: price_changes (recent price drops/rises), find_cheaper_alternative, similar_products, store_overview and stock_trend.
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

Text query matches product names (fuzzy, same as the alkometriikka.fi search box). Categorical filters are case-insensitive, accept several values (a product matches if it has ANY of them), and a partial value matches every value containing it (e.g. category "viini" matches all wine categories). Values are Finnish; call list_filter_values to discover them. grapes / taste_descriptors / food_pairings require the product to have ALL given values.

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
				food_pairings: stringList(
					'Food pairings the product must ALL suit (Finnish, from Alko), e.g. ["Rasvainen kala"] (fatty fish), ["Nauta"] (beef), ["Tulinen ruoka"] (spicy food)'
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
		'create_list_link',
		{
			title: 'Create a shareable list link',
			description: `Create a link to an alkometriikka.fi list (e.g. a shopping list or party plan) with a name and products with quantities. Opening the link shows the list on alkometriikka.fi with its totals, and the visitor can save it to their own lists. The whole list is encoded in the URL: nothing is stored, and a changed list needs a new link. Repeated product IDs are merged by adding up their quantities. Fails without creating a link if any product ID is not found. Returns the URL plus each product, its quantity and line total, and list totals (price, volume, alcohol grams, standard drinks). Share the url with the user as is.`,
			inputSchema: {
				name: z.string().min(1).max(100).describe('List name shown on the page, e.g. "Juhannus"'),
				items: z
					.array(
						z.object({
							product_id: productId,
							quantity: z
								.number()
								.int()
								.min(1)
								.max(LIST_QUANTITY_MAX)
								.optional()
								.describe('How many of this product (default 1)')
						})
					)
					.min(1)
					.max(LIST_ITEMS_MAX)
					.describe(`1–${LIST_ITEMS_MAX} products`)
			},
			outputSchema: {
				url: z.string(),
				name: z.string(),
				products: z.array(
					productSummary.extend({ quantity: z.number(), line_total_eur: z.number() })
				),
				totals: z.object({
					items: z.number(),
					price_eur: z.number(),
					volume_l: z.number(),
					alcohol_grams: z.number(),
					standard_drinks: z.number()
				}),
				note: z.string(),
				dataset: datasetStatus
			},
			annotations: { title: 'Create a shareable list link', ...READ_ONLY, idempotentHint: false }
		},
		async ({ name, items }) => result((await source.get()).createListLink(name, items))
	);

	server.registerTool(
		'create_punch_link',
		{
			title: 'Create a punch calculator link',
			description: `Create a link to the alkometriikka.fi punch calculator (boolilaskuri) for a punch or batch-drink recipe. Ingredients are either Alko products (by product_id) or other ingredients such as juice, soda or ice (name, package size, ABV and price). Opening the link shows the recipe in the calculator with total volume, strength, cost and servings, where the visitor can edit and save it. The whole recipe is encoded in the URL: nothing is stored, and a changed recipe needs a new link. Fails without creating a link if any product ID is not found. Returns the URL plus each ingredient, and the totals and per-person figures for the glass size and number of people. Share the url with the user as is.`,
			inputSchema: {
				name: z.string().max(80).describe('Recipe name, e.g. "Juhannusbooli"'),
				ingredients: z
					.array(
						z.union([
							z.object({
								product_id: productId,
								count: z
									.number()
									.positive()
									.max(PUNCH_COUNT_MAX)
									.optional()
									.describe('Number of packages of this product (default 1)')
							}),
							z.object({
								name: z.string().min(1).max(80).describe('E.g. "Sitruunalimu"'),
								volume_l: z
									.number()
									.min(0)
									.max(100)
									.describe('Package size in liters (0 for e.g. fruit)'),
								abv: z.number().min(0).max(100).describe('Alcohol percentage (0 for mixers)'),
								price_eur: z.number().min(0).max(10_000).describe('Price of one package in euros'),
								count: z
									.number()
									.positive()
									.max(PUNCH_COUNT_MAX)
									.optional()
									.describe('Number of packages (default 1)')
							})
						])
					)
					.min(1)
					.max(PUNCH_INGREDIENTS_MAX)
					.describe(`1–${PUNCH_INGREDIENTS_MAX} ingredients`),
				glass_l: z
					.number()
					.min(0.01)
					.max(2)
					.optional()
					.describe('Glass size in liters (default 0.2)'),
				people: z
					.number()
					.int()
					.min(1)
					.max(500)
					.optional()
					.describe('Number of people the punch is for (default 1)')
			},
			outputSchema: {
				url: z.string(),
				name: z.string(),
				glass_l: z.number(),
				people: z.number(),
				ingredients: z.array(
					z.object({
						name: z.string(),
						product_id: z.string().nullable(),
						count: z.number(),
						package_size_l: z.number(),
						alcohol_percentage: z.number(),
						package_price_eur: z.number(),
						line_total_eur: z.number()
					})
				),
				totals: z.object({
					volume_l: z.number(),
					alcohol_percentage: z.number(),
					price_eur: z.number(),
					standard_drinks: z.number(),
					glasses: z.number(),
					euro_per_standard_drink: z.number().nullable(),
					per_person: z.object({
						glasses: z.number(),
						standard_drinks: z.number(),
						price_eur: z.number()
					})
				}),
				note: z.string(),
				dataset: datasetStatus
			},
			annotations: { title: 'Create a punch calculator link', ...READ_ONLY, idempotentHint: false }
		},
		async ({ name, ingredients, glass_l, people }) =>
			result((await source.get()).createPunchLink(name, ingredients, { glass_l, people }))
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
						'Filter to list; "grape", "taste_descriptor" and "food_pairing" correspond to the grapes / taste_descriptors / food_pairings search filters'
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

	const dated = z.string().describe('YYYY-MM-DD');

	server.registerTool(
		'price_changes',
		{
			title: 'Recent price changes',
			description: `List products whose price changed recently, like the alkometriikka.fi price changes page: each product's latest change in the window with the old and new price. Use it for "what got cheaper this week?" or "which wines went up?". Optionally limit it to a category or subcategory. Only products in Alko's current selection are included.`,
			inputSchema: {
				days: z
					.number()
					.int()
					.min(1)
					.max(365)
					.optional()
					.describe('Look back this many days (default 30; the site uses 7, 30 and 90)'),
				direction: z
					.enum(['all', 'down', 'up'])
					.optional()
					.describe('"down": only price drops, "up": only rises (default all)'),
				category: z.string().max(100).optional().describe('Category, e.g. "Viinit"'),
				subcategory: z.string().max(100).optional().describe('Subcategory, e.g. "Punaviinit"'),
				sort_by: z
					.enum(['date', 'percent'])
					.optional()
					.describe('"date": newest first (default); "percent": biggest change first'),
				limit: z.number().int().min(1).max(50).optional().describe('Results to return (default 20)')
			},
			outputSchema: {
				since: dated,
				days: z.number(),
				scope: z.string(),
				total_changes: z.number(),
				price_drops: z.number(),
				price_rises: z.number(),
				changes: z.array(
					productSummary.extend({
						change_date: dated,
						previous_price_eur: z.number(),
						new_price_eur: z.number(),
						change_percent: z.number(),
						is_sale_price: z.boolean()
					})
				),
				changes_truncated: z.boolean(),
				note: z.string(),
				dataset: datasetStatus
			},
			annotations: { title: 'Recent price changes', ...READ_ONLY }
		},
		async ({ days, direction, category, subcategory, sort_by, limit }) =>
			result(
				(await source.get()).priceChanges({
					days: days ?? 30,
					direction: direction ?? 'all',
					category,
					subcategory,
					sort_by: sort_by ?? 'date',
					limit: limit ?? 20
				})
			)
	);

	server.registerTool(
		'find_cheaper_alternative',
		{
			title: 'Find a cheaper alternative',
			description: `Find a cheaper, comparable replacement for a product: the cheapest active product of the same type, subcategory and style, within one percentage point of alcohol, in whole packages that add up to about the same amount. Returns the saving for the given quantity, or null when nothing saves at least 50 cents. Optionally restrict to products sold in a store or city.`,
			inputSchema: {
				product_id: productId,
				quantity: z
					.number()
					.int()
					.min(1)
					.max(LIST_QUANTITY_MAX)
					.optional()
					.describe('How many packages are being bought (default 1)'),
				store: z
					.string()
					.max(100)
					.optional()
					.describe('Only alternatives listed in this store (ID or name) or any store in this city')
			},
			outputSchema: {
				product: productSummary,
				quantity: z.number(),
				current_cost_eur: z.number(),
				only_in_stores: z.array(z.string()).optional(),
				alternative: z
					.object({
						product: productSummary,
						quantity: z.number(),
						cost_eur: z.number(),
						saving_eur: z.number()
					})
					.nullable(),
				note: z.string(),
				dataset: datasetStatus
			},
			annotations: { title: 'Find a cheaper alternative', ...READ_ONLY }
		},
		async ({ product_id, quantity, store }) =>
			result(
				(await source.get()).cheaperAlternative(product_id, { quantity: quantity ?? 1, store })
			)
	);

	server.registerTool(
		'similar_products',
		{
			title: 'Find similar products',
			description: `Find products similar to a given one in Alko's current selection, ranked the way the product pages do (category, price, size, sugar, packaging, alcohol per euro, grapes and taste). Use it for "something like this, but …" and combine with max_price for cheaper options.`,
			inputSchema: {
				product_id: productId,
				limit: z
					.number()
					.int()
					.min(1)
					.max(25)
					.optional()
					.describe('Results to return (default 10)'),
				max_price: z.number().min(0).optional().describe('Only products up to this price in euros')
			},
			outputSchema: {
				product: productSummary,
				similar: z.array(productSummary),
				note: z.string(),
				dataset: datasetStatus
			},
			annotations: { title: 'Find similar products', ...READ_ONLY }
		},
		async ({ product_id, limit, max_price }) =>
			result((await source.get()).similarProducts(product_id, { limit: limit ?? 10, max_price }))
	);

	server.registerTool(
		'store_overview',
		{
			title: 'Alko store overview',
			description: `Overview of one Alko store: opening hours today, how many products it lists, its products on sale (biggest discount first), the best alcohol-per-euro product per category, and products that recently arrived there. Based on the availability snapshot; stock quantities are not known.`,
			inputSchema: {
				store: z
					.string()
					.min(1)
					.max(100)
					.describe(
						'Store ID or name (a city only works if it has a single store; use list_filter_values with field "store" to find stores)'
					),
				limit: z
					.number()
					.int()
					.min(1)
					.max(25)
					.optional()
					.describe('Entries per section (default 5)')
			},
			outputSchema: {
				store: z.object({
					store_id: z.string(),
					name: z.string(),
					city: z.string().nullable(),
					address: z.string().nullable(),
					postal_code: z.string().nullable(),
					opening_hours_today: z.string().nullable(),
					open_now: z.boolean()
				}),
				product_count: z.number(),
				sales: z.object({
					total: z.number(),
					top: z.array(
						productSummary.extend({
							normal_price_eur: z.number(),
							discount_percent: z.number(),
							campaign_end: z.string().nullable()
						})
					)
				}),
				best_value_by_category: z.array(productSummary),
				recent_arrivals: z.array(productSummary.extend({ arrived: dated })).nullable(),
				limitations: z.array(z.string()),
				dataset: datasetStatus
			},
			annotations: { title: 'Alko store overview', ...READ_ONLY }
		},
		async ({ store, limit }) => result(await (await source.get()).storeOverview(store, limit ?? 5))
	);

	server.registerTool(
		'stock_trend',
		{
			title: 'Product stock trend',
			description: `How many Alko stores have listed a product each day over the last 90 days, with the change over a period. Use it to see whether a product is spreading to more stores, or selling out and being phased out. It counts stores, not units: stock quantities are not known. The history only goes back to when Alkometriikka started recording it.`,
			inputSchema: {
				product_id: productId,
				days: z
					.number()
					.int()
					.min(1)
					.max(90)
					.optional()
					.describe('Period to compare and return, in days (default 30)')
			},
			outputSchema: {
				product: productSummary,
				current_store_count: z.number(),
				history_available: z.boolean(),
				trend: z
					.object({
						days_compared: z.number(),
						store_count_now: z.number(),
						store_count_before: z.number(),
						compared_from: dated,
						change: z.number()
					})
					.nullable(),
				history: z.array(z.object({ date: dated, store_count: z.number() })),
				note: z.string(),
				dataset: datasetStatus
			},
			annotations: { title: 'Product stock trend', ...READ_ONLY }
		},
		async ({ product_id, days }) =>
			result(await (await source.get()).stockTrend(product_id, days ?? 30))
	);

	server.registerTool(
		'suggest_punch',
		{
			title: 'Suggest a punch',
			description: `Build a ready-to-share punch (booli) from one of the site's templates: it picks the cheapest matching Alko products (optionally only ones sold in a store or city), adds mixers, scales everything to the number of people and glasses, and returns a punch calculator link with totals. Templates: ${PUNCH_TEMPLATE_IDS.join(', ')}. For a custom recipe use create_punch_link instead. Mixer prices are rough supermarket guesses and editable in the calculator.`,
			inputSchema: {
				template: z.enum(PUNCH_TEMPLATE_IDS).describe('Punch template'),
				people: z.number().int().min(1).max(500).describe('Number of people'),
				glasses_per_person: z
					.number()
					.min(0.5)
					.max(20)
					.optional()
					.describe('Glasses of punch per person (default 3)'),
				glass_l: z
					.number()
					.min(0.01)
					.max(2)
					.optional()
					.describe('Glass size in liters (default 0.2)'),
				max_budget_eur: z
					.number()
					.min(0)
					.optional()
					.describe('Budget in euros; the result says whether the punch fits in it'),
				store: z
					.string()
					.max(100)
					.optional()
					.describe('Prefer products sold in this store (ID or name) or any store in this city')
			},
			outputSchema: {
				template: z.object({ id: z.string(), name: z.string(), description: z.string() }),
				url: z.string(),
				name: z.string(),
				glass_l: z.number(),
				people: z.number(),
				ingredients: z.array(
					z.object({
						name: z.string(),
						product_id: z.string().nullable(),
						count: z.number(),
						package_size_l: z.number(),
						alcohol_percentage: z.number(),
						package_price_eur: z.number(),
						line_total_eur: z.number()
					})
				),
				totals: z.looseObject({}),
				within_budget: z.boolean().nullable(),
				max_budget_eur: z.number().nullable(),
				unresolved_ingredients: z.array(z.string()).optional(),
				note: z.string(),
				dataset: datasetStatus
			},
			annotations: { title: 'Suggest a punch', ...READ_ONLY, idempotentHint: false }
		},
		async ({ template, people, glasses_per_person, glass_l, max_budget_eur, store }) =>
			result(
				(await source.get()).suggestPunch({
					template,
					people,
					glasses_per_person: glasses_per_person ?? 3,
					glass_l,
					max_budget_eur,
					store
				})
			)
	);

	// ------------------------------------------------------------------------
	// Resources: reference data a client can read without a tool call
	// ------------------------------------------------------------------------

	server.registerResource(
		'punch-templates',
		'alkometriikka://punch-templates',
		{
			title: 'Punch templates',
			description: 'The punch templates suggest_punch can build, with their ingredients.',
			mimeType: 'application/json'
		},
		(uri) => ({
			contents: [
				{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(PUNCH_TEMPLATES_INFO) }
			]
		})
	);

	server.registerResource(
		'filter-values',
		new ResourceTemplate('alkometriikka://filter-values/{field}', {
			list: () => ({
				resources: filterFields.map((field) => ({
					uri: `alkometriikka://filter-values/${field}`,
					name: `filter-values-${field}`,
					title: `Filter values: ${field}`,
					mimeType: 'application/json'
				}))
			}),
			complete: { field: () => [...filterFields] }
		}),
		{
			title: 'Filter values',
			description:
				'All valid values of a search_products filter (category, subcategory, style, country, region, manufacturer, packaging, selection, grape, taste_descriptor, food_pairing, store) with product counts.',
			mimeType: 'application/json'
		},
		async (uri, { field }) => {
			const name = String(field);
			if (!(filterFields as string[]).includes(name)) {
				throw new Error(`Unknown filter "${name}". Fields: ${filterFields.join(', ')}.`);
			}
			const values = (await source.get()).filterValues(name as FilterField, undefined, 500);
			return {
				contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(values) }]
			};
		}
	);

	// ------------------------------------------------------------------------
	// Prompts: starting points that clients show as slash commands
	// ------------------------------------------------------------------------

	const userPrompt = (text: string) => ({
		messages: [{ role: 'user' as const, content: { type: 'text' as const, text } }]
	});

	server.registerPrompt(
		'plan_party',
		{
			title: 'Plan a party',
			description: 'Plan the drinks for a party within a budget and get shareable links.',
			argsSchema: {
				people: z.string().describe('Number of guests'),
				budget_eur: z.string().optional().describe('Budget in euros'),
				wishes: z.string().optional().describe('What the guests like, restrictions, occasion')
			}
		},
		({ people, budget_eur, wishes }) =>
			userPrompt(
				`Plan the drinks for a party of ${people} people${budget_eur ? ` with a budget of ${budget_eur} €` : ''}${wishes ? `. Notes: ${wishes}` : ''}.\n\n` +
					`Use the alkometriikka tools: search_products (and list_filter_values when unsure of a value) to find good-value drinks, suggest_punch or create_punch_link if a punch fits, and create_list_link for a shopping list with quantities. ` +
					`Check the total against the budget, use find_cheaper_alternative where it saves money, and finish by giving the links and the total cost. Allow roughly 3–4 standard drinks per guest unless told otherwise.`
			)
	);

	server.registerPrompt(
		'best_value',
		{
			title: 'Best value in a category',
			description: 'Find the best value-for-money products in a category.',
			argsSchema: {
				category: z.string().describe('E.g. "Oluet", "Punaviinit", "Viskit"'),
				max_price: z.string().optional().describe('Maximum price in euros')
			}
		},
		({ category, max_price }) =>
			userPrompt(
				`Find the best value products in "${category}"${max_price ? ` up to ${max_price} €` : ''}. ` +
					`Use search_products sorted by alcohol_grams_per_euro (or price_per_liter for non-alcoholic drinks), compare the top candidates with compare_products, and mention any that are on sale or have recently dropped in price (price_changes). Give a short ranked list with prices.`
			)
	);

	server.registerPrompt(
		'pair_with_food',
		{
			title: 'Pair a drink with food',
			description: 'Suggest drinks for a dish.',
			argsSchema: {
				dish: z.string().describe('The dish or meal'),
				max_price: z.string().optional().describe('Maximum price in euros')
			}
		},
		({ dish, max_price }) =>
			userPrompt(
				`Suggest drinks to go with: ${dish}${max_price ? ` (up to ${max_price} € each)` : ''}. ` +
					`Map the dish to Alko's food pairing categories (list_filter_values with field "food_pairing"), then use search_products with food_pairings to find options. Offer a few choices with different styles and prices.`
			)
	);

	return server;
}

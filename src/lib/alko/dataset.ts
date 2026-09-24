import { DatasetColumns } from '$lib/utils/constants';
import type { AvailabilityData, AvailabilityStore, ColumnNames } from '$lib/types';

/**
 * Parsing of the published `data.json` / `availability.json` files into the
 * shapes `Kaljakori` consumes. Kept free of SvelteKit imports so the same code
 * is shared by the web app (`+layout.ts`) and the MCP server (`mcp/`).
 */

type MigratedProduct = {
	values: unknown[];
	priceHistory?: {
		date: string;
		price: number;
		normalPrice?: number;
		campaignStart?: string;
		campaignEnd?: string;
	}[];
	meta?: { removedFromSelection?: string };
};

type Dataset = {
	schema?: unknown;
	metadata?: { LastUpdated?: string; LastSynced?: string };
	products?: Record<string, MigratedProduct>;
};

export type DatasetMetadata = { LastUpdated?: string; LastSynced?: string; [key: string]: unknown };

export function formatDatasetToJSON(data: string): {
	table: any[];
	metadata: DatasetMetadata;
} {
	try {
		const { schema, metadata: datasetMeta, products = {} } = JSON.parse(data) as Dataset;
		if (!Array.isArray(schema) || schema.length === 0) {
			throw new Error('Hinnasto on tyhjä tai väärässä muodossa');
		}
		// Validate the dataset shape. Unknown schema columns are tolerated and
		// merely warned about: rows are read positionally (and new columns are
		// always appended at the end of the legacy header), so a dataset written
		// by a newer sync can never crash an older deployed bundle during a
		// frontend/data rollout — the extra columns are simply ignored.
		if (schema[0] !== DatasetColumns.Number)
			throw new Error('Hinnasto on tyhjä tai väärässä muodossa');
		const knownColumns = Object.values(DatasetColumns) as ColumnNames[];
		for (const column of schema) {
			if (!knownColumns.includes(column as ColumnNames))
				console.warn(`Tuntematon sarake datassa: ${column}`);
		}

		// The new format stores each product under its id and keeps price history
		// in a separate `priceHistory` field. Rebuild the table shape the app
		// expects: a header row plus one row per product with the price history
		// appended as the "Hintahistoria" column. Every product is kept —
		// including ones no longer in Alko's selection — so nothing disappears
		// from the UI. Whether a product has been removed from the selection is
		// recorded in `meta.removedFromSelection` and appended as its own column.
		const header = [...schema, DatasetColumns.History, DatasetColumns.RemovedFromSelection];

		let latestDate: string | undefined;
		const rows = Object.values(products)
			.filter(
				(product): product is MigratedProduct =>
					!!product && typeof product === 'object' && Array.isArray(product.values)
			)
			.map((product) => {
				const priceHistory = Array.isArray(product.priceHistory) ? product.priceHistory : [];
				for (const point of priceHistory) {
					if (point?.date && (!latestDate || point.date > latestDate)) latestDate = point.date;
				}
				const removedFromSelection = Boolean(product.meta?.removedFromSelection);
				return [...product.values, priceHistory, removedFromSelection];
			});

		if (rows.length === 0) {
			throw new Error('Hinnasto on tyhjä tai väärässä muodossa');
		}

		// Prefer the dataset's recorded last-modified date; fall back to the
		// newest price-history entry for older datasets without metadata.
		const metadata = datasetMeta ? { ...datasetMeta } : {};

		return {
			table: [header, ...rows],
			metadata
		};
	} catch (e) {
		if (e instanceof Error) throw e;
		throw new Error('Hinnaston lataus epäonnistui');
	}
}

/**
 * Validates parsed `availability.json` content, dropping malformed entries and
 * non-store outlets (`outletType` "2").
 */
export function parseAvailability(raw: unknown): AvailabilityData {
	const data = raw as Partial<AvailabilityData>;
	if (!data || typeof data !== 'object' || !data.stores || !data.product) {
		throw new Error('Saatavuustiedot ovat tyhjät tai väärässä muodossa');
	}

	const stores = Object.fromEntries(
		Object.entries(data.stores).filter(
			(entry): entry is [string, AvailabilityStore] =>
				!!entry[1] &&
				typeof entry[1] === 'object' &&
				typeof entry[1].id === 'string' &&
				typeof entry[1].name === 'string' &&
				entry[1].outletType !== '2'
		)
	);
	const product = Object.fromEntries(
		Object.entries(data.product).filter(
			(entry): entry is [string, string[]] =>
				Array.isArray(entry[1]) && entry[1].every((storeId) => typeof storeId === 'string')
		)
	);

	return { lastUpdated: data.lastUpdated, stores, product };
}

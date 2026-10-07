import type { ColumnNames } from '../types';
import { DatasetColumns } from './constants';

/**
 * Lenient view of a product as stored in `data.json`. The sync scripts write
 * the stricter `MigratedProduct` (scripts/data/types.ts); readers only rely on
 * what is declared here.
 */
export type StoredProduct = {
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

export type StoredDataset = {
	schema?: unknown;
	metadata?: { LastUpdated?: string; LastSynced?: string };
	products?: Record<string, StoredProduct>;
	/**
	 * Filter values precomputed by the sync (`DatasetIndex` in $lib/alko). Optional:
	 * older datasets lack it, and Kaljakori ignores one that doesn't match the products.
	 */
	index?: unknown;
};

export function parseDataset(data: string) {
	try {
		const {
			schema,
			metadata: datasetMeta,
			products = {},
			index
		} = JSON.parse(data) as StoredDataset;
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
				(product): product is StoredProduct =>
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
		const metadata: NonNullable<StoredDataset['metadata']> = { ...datasetMeta };
		if (!metadata.LastUpdated && latestDate) metadata.LastUpdated = latestDate;

		return {
			table: [header, ...rows],
			metadata,
			index
		};
	} catch (e) {
		if (e instanceof Error) throw e;
		throw new Error('Hinnaston lataus epäonnistui');
	}
}

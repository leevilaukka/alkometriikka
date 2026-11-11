/**
 * Barcodes found by the site's scanner. Alko's data has no EANs, so the scanner asks the
 * api.alkometriikka.fi Worker (workers/api), which looks each new barcode up from Alko once and
 * keeps it. The sync reads them all from the Worker's export and writes each into its product's
 * EAN column, so later scans of it are answered from data.json. See docs/api-worker.md.
 */

import { isValidGtin } from '../../src/lib/utils/catalog/gtin.ts';
import { LEGACY_HEADERS } from './constants.ts';
import { isEmptyValue } from './safeguards.ts';
import type { MigratedProduct } from './types.ts';

export interface ScannedEan {
	ean: string;
	/** Alko product number */
	id: string;
	/** When Alko confirmed the mapping, ISO date-time */
	seenAt: string;
}

const EAN_INDEX = LEGACY_HEADERS.indexOf('EAN');
const EXPORT_TIMEOUT_MS = 30_000;

function isScannedEan(value: unknown): value is ScannedEan {
	const entry = value as ScannedEan;
	return (
		typeof entry?.ean === 'string' &&
		/^\d{8,14}$/.test(entry.ean) &&
		typeof entry.id === 'string' &&
		typeof entry.seenAt === 'string'
	);
}

/**
 * The Worker's stored barcodes, or null when the export isn't configured (GTIN_EXPORT_URL and
 * GTIN_EXPORT_TOKEN, unset locally) or can't be read. Without them the sync carries on with the
 * EANs data.json already has.
 */
export async function loadScannedEans(): Promise<ScannedEan[] | null> {
	const url = process.env.GTIN_EXPORT_URL;
	const token = process.env.GTIN_EXPORT_TOKEN;
	if (!url || !token) return null;
	try {
		const response = await fetch(url, {
			headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
			signal: AbortSignal.timeout(EXPORT_TIMEOUT_MS)
		});
		if (!response.ok) throw new Error(`status ${response.status}`);
		const body = (await response.json()) as { entries?: unknown };
		if (!Array.isArray(body.entries)) throw new Error('no entries in the response');
		return body.entries.filter(isScannedEan);
	} catch (error) {
		console.warn(`  ⚠️  Couldn't read the scanned barcodes (${error}); keeping the stored EANs`);
		return null;
	}
}

/** True for a stored EAN that can identify a product: a valid GTIN that isn't all zeros */
function isUsableEan(value: unknown): value is string {
	return typeof value === 'string' && isValidGtin(value) && !/^0+$/.test(value);
}

function withEan(product: MigratedProduct, ean: string | null): MigratedProduct {
	const values = [...product.values];
	values[EAN_INDEX] = ean;
	return { ...product, values };
}

/**
 * Writes scanned barcodes into the EAN column of the products they belong to. The Worker's answer
 * is newer than anything stored, so it replaces a different EAN; one product with several scanned
 * barcodes gets the first one seen (the others are still answered by the Worker). Returns the
 * products whose EAN changed.
 */
export function applyScannedEans(
	products: Record<string, MigratedProduct>,
	entries: ScannedEan[]
): string[] {
	const byProduct = new Map<string, ScannedEan>();
	for (const entry of entries) {
		const current = byProduct.get(entry.id);
		const earlier =
			!current ||
			entry.seenAt < current.seenAt ||
			(entry.seenAt === current.seenAt && entry.ean < current.ean);
		if (earlier) byProduct.set(entry.id, entry);
	}
	const updated: string[] = [];
	for (const [id, entry] of byProduct) {
		const product = products[id];
		if (!product || product.values[EAN_INDEX] === entry.ean) continue;
		products[id] = withEan(product, entry.ean);
		updated.push(id);
	}
	return updated;
}

/**
 * Empties EANs that can't identify a product, so the scanner never opens the wrong one: values
 * that aren't a valid GTIN (a legacy import left price history in some) and barcodes shared by
 * several products (the legacy list reuses one across a producer's vintages). When a scanned
 * barcode confirms one of the sharing products, or only one of them is still in the selection,
 * that one keeps it. Returns the products cleared.
 */
export function cleanEans(
	products: Record<string, MigratedProduct>,
	entries: ScannedEan[] = []
): string[] {
	const cleared: string[] = [];
	const owners = new Map<string, string[]>();
	for (const [id, product] of Object.entries(products)) {
		const ean = product.values[EAN_INDEX];
		if (isEmptyValue(ean)) continue;
		if (!isUsableEan(ean)) {
			products[id] = withEan(product, null);
			cleared.push(id);
			continue;
		}
		owners.set(ean, [...(owners.get(ean) ?? []), id]);
	}
	const confirmed = new Map(entries.map((entry) => [entry.ean, entry.id]));
	for (const [ean, ids] of owners) {
		if (ids.length < 2) continue;
		// A scan decides first; otherwise a lone active product beats removed ones (a renumbered
		// product's old entry still has the barcode)
		const active = ids.filter((id) => !products[id].meta?.removedFromSelection);
		const keeper = confirmed.get(ean) ?? (active.length === 1 ? active[0] : undefined);
		for (const id of ids) {
			if (id === keeper) continue;
			products[id] = withEan(products[id], null);
			cleared.push(id);
		}
	}
	return cleared;
}

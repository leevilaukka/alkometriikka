import type { PriceListItem } from '$lib/types';
import { API_ORIGIN } from '$lib/utils/constants/app';
import { AllColumns } from '$lib/utils/constants/columns';
import { isValidGtin } from './gtin';

export type BarcodeMatch =
	| { source: 'local' | 'worker'; product: PriceListItem }
	| { source: 'not_found' | 'error'; product?: undefined };

type Catalog = { data: PriceListItem[]; findById(id: string): PriceListItem | undefined };

/** A UPC-A code is an EAN-13 with a leading zero, which is how Alko and data.json store it */
export function normalizeBarcode(code: string, format: string): string {
	return format === 'upc_a' && code.length === 12 ? `0${code}` : code;
}

/** How long the Worker's answer for a barcode is remembered by this page, found or not */
const ANSWER_TTL_MS = 30 * 60 * 1000;
const answers = new Map<string, { answer: string | 'not_found'; at: number }>();

/** Forgets the remembered Worker answers (for tests) */
export function clearBarcodeAnswers() {
	answers.clear();
}

/**
 * Null on a network error or an answer other than found / not found. Both real answers are kept
 * in memory, so scanning the same code again doesn't reach the Worker; failures are not, so a
 * retry can succeed.
 */
async function askWorker(ean: string, fetchFn: typeof fetch): Promise<string | 'not_found' | null> {
	const known = answers.get(ean);
	if (known && Date.now() - known.at < ANSWER_TTL_MS) return known.answer;
	const answer = await fetchWorker(ean, fetchFn);
	if (answer !== null) answers.set(ean, { answer, at: Date.now() });
	return answer;
}

async function fetchWorker(
	ean: string,
	fetchFn: typeof fetch
): Promise<string | 'not_found' | null> {
	try {
		// The Worker knows barcodes data.json doesn't have yet
		const response = await fetchFn(`${API_ORIGIN}/gtin/${ean}`);
		if (response.status === 404) return 'not_found';
		if (!response.ok) return null;
		const { id } = (await response.json()) as { id?: unknown };
		return typeof id === 'string' ? id : null;
	} catch {
		return null;
	}
}

/**
 * The product for a scanned barcode. data.json has the EANs earlier scans found (and some old
 * ones from the legacy price list); anything else is asked from the Worker, which also stores it
 * for the next sync. A barcode only found on a product removed from the selection is asked too,
 * as Alko may sell it under a new number now, and the removed product is the fallback.
 */
export async function findProductByBarcode(
	catalog: Catalog,
	ean: string,
	fetchFn: typeof fetch = fetch
): Promise<BarcodeMatch> {
	if (!isValidGtin(ean)) return { source: 'not_found' };
	const matches = catalog.data.filter((product) => product[AllColumns.EAN] === ean);
	const active = matches.find((product) => !product[AllColumns.RemovedFromSelection]);
	if (active) return { source: 'local', product: active };

	const removed = matches[0];
	const answer = await askWorker(ean, fetchFn);
	const product = answer && answer !== 'not_found' ? catalog.findById(answer) : undefined;
	if (product) return { source: 'worker', product };
	if (removed) return { source: 'local', product: removed };
	return { source: answer === null ? 'error' : 'not_found' };
}

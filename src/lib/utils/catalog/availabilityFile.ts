/**
 * The product → store map in availability.json. Written as one list of store ids and, per
 * product, a base64 bitmap of indexes into it: about a quarter of the download of a list of
 * id strings per product, and much less JSON to parse.
 */

export const AVAILABILITY_FORMAT = 2;

export type StockedStores = {
	/** Every store id a product refers to, including pickup points left out of `stores` */
	storeIds: string[];
	/** Product → bitmap of `storeIds` indexes, bit `i % 8` of byte `i / 8`, trailing zero bytes cut */
	product: Record<string, string>;
};

function toBase64(bytes: Uint8Array) {
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary);
}

/** Packs each product's store id list into a bitmap. */
export function encodeStockedStores(product: Record<string, string[]>): StockedStores {
	const storeIds = [...new Set(Object.values(product).flat())].sort((a, b) =>
		a.localeCompare(b, 'en', { numeric: true })
	);
	const indexOf = new Map(storeIds.map((id, index) => [id, index]));
	const encoded: Record<string, string> = {};
	for (const [productId, ids] of Object.entries(product)) {
		const bytes = new Uint8Array(Math.ceil(storeIds.length / 8));
		let length = 0;
		for (const id of ids) {
			const index = indexOf.get(id)!;
			bytes[index >> 3] |= 1 << (index & 7);
			length = Math.max(length, (index >> 3) + 1);
		}
		encoded[productId] = toBase64(bytes.subarray(0, length));
	}
	return { storeIds, product: encoded };
}

function decodeBitmap(bitmap: string, storeIds: string[]): string[] | null {
	let binary: string;
	try {
		binary = atob(bitmap);
	} catch {
		return null;
	}
	const ids: string[] = [];
	for (let byteIndex = 0; byteIndex < binary.length; byteIndex++) {
		const byte = binary.charCodeAt(byteIndex);
		for (let bit = 0; byte >> bit; bit++) {
			if (!(byte & (1 << bit))) continue;
			const id = storeIds[byteIndex * 8 + bit];
			if (id === undefined) return null;
			ids.push(id);
		}
	}
	return ids;
}

/**
 * The product → store ids map of a parsed availability.json, in this format or the earlier one
 * with a list of ids per product (an old copy in the service worker's cache, or the previous
 * deploy). Malformed products are dropped; null when there is no map at all.
 */
export function readStockedStores(data: {
	storeIds?: unknown;
	product?: unknown;
}): Record<string, string[]> | null {
	if (!data.product || typeof data.product !== 'object') return null;
	const storeIds = Array.isArray(data.storeIds) ? (data.storeIds as unknown[]) : null;
	if (storeIds && !storeIds.every((id) => typeof id === 'string')) return null;

	const product: Record<string, string[]> = {};
	for (const [productId, value] of Object.entries(data.product)) {
		if (storeIds && typeof value === 'string') {
			const ids = decodeBitmap(value, storeIds as string[]);
			if (ids) product[productId] = ids;
		} else if (!storeIds && Array.isArray(value) && value.every((id) => typeof id === 'string')) {
			product[productId] = value;
		}
	}
	return product;
}

/**
 * How the dataset is laid out on disk, shared by the sync, the build scripts and the app.
 *
 * - Products no longer in Alko's selection are in a second file, `data-removed.json`, so the
 *   app can show the selection before downloading them. `data.json` records how many there are.
 * - Columns of words from a small vocabulary (tasting notes, food pairings) are stored as indexes
 *   into a word list per file.
 *
 * `unpackDataset` undoes both and gives back one dataset with every product, as it was stored
 * before these changes; datasets written before them pass through unchanged.
 */

export const REMOVED_DATASET_FILE = 'data-removed.json';

/** Columns stored as indexes into the file's `dictionaries` */
export const DICTIONARY_COLUMNS = ['Luonnehdinta', 'Ruokasuositukset'] as const;

type Product = { values: unknown[]; meta?: { removedFromSelection?: string } };

type Products<P> = Record<string, P>;

export type PackedFile<P> = {
	schema?: unknown;
	/** Word list per dictionary column */
	dictionaries?: Record<string, string[]>;
	products?: Products<P>;
};

/** `data.json` once packed: the selection, and how many removed products the other file holds */
export type PackedDataset<P> = PackedFile<P> & { removedProducts?: number };

function isProduct(product: unknown): product is Product {
	return !!product && typeof product === 'object' && Array.isArray((product as Product).values);
}

function dictionaryIndexes(schema: unknown) {
	if (!Array.isArray(schema)) return [];
	return DICTIONARY_COLUMNS.map((column) => [column, schema.indexOf(column)] as const).filter(
		([, index]) => index >= 0
	);
}

/** Replaces dictionary column words with indexes into per-column word lists. */
function encodeProducts<P>(schema: unknown, products: Products<P>) {
	const dictionaries: Record<string, string[]> = {};
	const columns = dictionaryIndexes(schema);
	const lookups = columns.map(([column]) => {
		const words = (dictionaries[column] = [] as string[]);
		const indexOf = new Map<string, number>();
		return (word: string) => {
			let index = indexOf.get(word);
			if (index === undefined) indexOf.set(word, (index = words.push(word) - 1));
			return index;
		};
	});
	const encoded: Products<P> = {};
	for (const [id, product] of Object.entries(products)) {
		if (!isProduct(product)) {
			encoded[id] = product;
			continue;
		}
		const values = [...product.values];
		columns.forEach(([, index], i) => {
			const value = values[index];
			if (typeof value === 'string') values[index] = lookups[i](value);
			else if (Array.isArray(value) && value.every((word) => typeof word === 'string'))
				values[index] = value.map(lookups[i]);
		});
		encoded[id] = { ...product, values };
	}
	return { dictionaries, products: encoded };
}

/** Puts the words back; an index with no word becomes null. */
function decodeProducts<P>(file: PackedFile<P>): Products<P> {
	const products = file.products ?? {};
	const columns = dictionaryIndexes(file.schema).filter(([column]) =>
		Array.isArray(file.dictionaries?.[column])
	);
	if (!columns.length) return products;
	const decoded: Products<P> = {};
	for (const [id, product] of Object.entries(products)) {
		if (!isProduct(product)) {
			decoded[id] = product;
			continue;
		}
		const values = [...product.values];
		for (const [column, index] of columns) {
			const words = file.dictionaries![column];
			const value = values[index];
			if (typeof value === 'number') values[index] = words[value] ?? null;
			else if (Array.isArray(value))
				values[index] = value.map((word) =>
					typeof word === 'number' ? (words[word] ?? null) : word
				);
		}
		decoded[id] = { ...product, values };
	}
	return decoded;
}

/**
 * Splits a dataset into `data.json` (the selection) and `data-removed.json`, each with its own
 * word lists. Everything besides `products` stays in `data.json`.
 */
export function packDataset<P, D extends { schema?: unknown; products?: Products<P> }>(data: D) {
	const active: Products<P> = {};
	const removed: Products<P> = {};
	for (const [id, product] of Object.entries(data.products ?? {})) {
		if (isProduct(product) && product.meta?.removedFromSelection) removed[id] = product;
		else active[id] = product;
	}
	return {
		data: {
			...data,
			...encodeProducts(data.schema, active),
			removedProducts: Object.keys(removed).length
		},
		removed: { schema: data.schema, ...encodeProducts(data.schema, removed) }
	};
}

/** How many products `data-removed.json` should hold, or 0 for a dataset that has none */
export function expectedRemovedProducts(data: unknown): number {
	const count = (data as PackedDataset<unknown> | null)?.removedProducts;
	return typeof count === 'number' && count > 0 ? count : 0;
}

function sameSchema(a: unknown, b: unknown) {
	return (
		Array.isArray(a) &&
		Array.isArray(b) &&
		a.length === b.length &&
		a.every((column, index) => column === b[index])
	);
}

/**
 * The products of a parsed `data-removed.json`, decoded, or null if it isn't one or was written
 * with another schema than `schema` (its rows would be read against the wrong columns).
 */
export function unpackRemovedProducts<P>(removed: unknown, schema: unknown): Products<P> | null {
	const file = removed as PackedFile<P> | null;
	if (!file || typeof file !== 'object' || !file.products || typeof file.products !== 'object')
		return null;
	if (!sameSchema(file.schema, schema)) return null;
	return decodeProducts(file);
}

/**
 * A parsed `data.json`, decoded and with the products of `removed` (a parsed `data-removed.json`)
 * added, in the shape datasets had before the split. Products in both files keep the selection's
 * copy. `removed` is ignored if it doesn't match `data`'s schema; use `unpackRemovedProducts` to
 * tell that apart.
 */
export function unpackDataset<D extends PackedDataset<unknown>>(
	data: D,
	removed?: unknown
): Omit<D, 'dictionaries' | 'removedProducts'> {
	const { dictionaries: _dictionaries, removedProducts: _removed, ...rest } = data;
	const products = decodeProducts(data);
	const extra = removed === undefined ? null : unpackRemovedProducts(removed, data.schema);
	return { ...rest, products: extra ? { ...extra, ...products } : products };
}

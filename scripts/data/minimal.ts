/**
 * Writes `data.minimal.json`: a stripped-down copy of the dataset for the Bläkkiskili Telegram
 * bot, which keeps the whole file in memory. Only the columns the bot reads are kept, there is no
 * price history, `meta` or index, and every value is already a plain number, string or null, so
 * the consumer doesn't need to know about the dataset's dictionaries or legacy formats.
 *
 *   data.minimal.json  { schema, metadata: { LastUpdated }, products: { id: { values } } }
 *
 * Every product with an ABV is included, removed ones too (the bot filters alcohol-free drinks
 * itself). Run `bun run scripts/data/minimal.ts --data data.json --out data.minimal.json`;
 * `--dev` reads and writes `static/`. See docs/data/dataset-format.md.
 */
import { LEGACY_HEADERS, upgradeStoredValues } from './constants.ts';
import { readStoredDataset } from '../lib/stored-dataset.ts';

/** The columns the bot looks up by name; their order here is the order in the file. */
export const MINIMAL_COLUMNS = [
	'Numero',
	'Nimi',
	'Pullokoko',
	'Alkoholi-%',
	'Tyyppi',
	'EAN',
	'Hinta',
	'Energia kcal/100 ml',
	'Valmistaja',
	'Valmistusmaa',
	'Alatyyppi',
	'Valikoima',
	'Tila'
] as const;

export type MinimalDataset = {
	schema: typeof MINIMAL_COLUMNS;
	metadata: { LastUpdated: string };
	products: Record<string, { values: (string | number | null)[] }>;
};

type StoredProduct = { values?: unknown[]; meta?: { removedFromSelection?: string } };
type StoredData = {
	schema?: string[];
	metadata?: { LastUpdated?: string };
	products?: Record<string, StoredProduct>;
};

/** A finite number, or the number inside a string like "13.5" or "0.75 l". Otherwise null. */
function toNumber(value: unknown): number | null {
	if (typeof value === 'number') return Number.isFinite(value) ? value : null;
	if (typeof value !== 'string') return null;
	const match = /^\s*(\d+(?:[.,]\d+)?)\s*(?:l)?\s*$/i.exec(value);
	return match ? Number(match[1].replace(',', '.')) : null;
}

function toText(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const text = value.trim();
	return text === '' ? null : text;
}

const NUMERIC = new Set(['Pullokoko', 'Alkoholi-%', 'Hinta', 'Energia kcal/100 ml']);

/** The kept columns of one product, or null when it has no ABV. */
function minimalValues(values: unknown[]): MinimalDataset['products'][string]['values'] | null {
	const row = MINIMAL_COLUMNS.map((column) => {
		const value = values[LEGACY_HEADERS.indexOf(column)];
		return NUMERIC.has(column) ? toNumber(value) : toText(value);
	});
	const abv = row[MINIMAL_COLUMNS.indexOf('Alkoholi-%')] as number | null;
	if (abv === null) return null;

	// Unknown is null, never 0: a price of 0 is a missing one, and so is 0 kcal in an alcoholic drink
	for (const column of ['Hinta', 'Energia kcal/100 ml'] as const) {
		const i = MINIMAL_COLUMNS.indexOf(column);
		if (row[i] === 0 && (column === 'Hinta' || abv > 0)) row[i] = null;
	}
	return row;
}

const TYYPPI = MINIMAL_COLUMNS.indexOf('Tyyppi');
const ALATYYPPI = MINIMAL_COLUMNS.indexOf('Alatyyppi');

/**
 * Removed products can carry the taxonomy of the old price list, where "punaviinit" or "oluet"
 * was a Tyyppi. Like the app's category pages, those are mapped onto the current Tyyppi: the one
 * with that name in other casing ("alkoholittomat"), or the one that has a subtype of that name,
 * if exactly one does. Anything else is left as it is.
 */
function legacyTypeMapper(
	rows: Iterable<{ values: MinimalDataset['products'][string]['values'] }>
) {
	const types = new Map<string, string>();
	const subTypeOwners = new Map<string, Set<string>>();
	for (const { values } of rows) {
		const type = values[TYYPPI];
		if (typeof type !== 'string') continue;
		types.set(type.toLowerCase(), type);
		const subType = values[ALATYYPPI];
		if (typeof subType !== 'string') continue;
		const key = subType.toLowerCase();
		if (!subTypeOwners.has(key)) subTypeOwners.set(key, new Set());
		subTypeOwners.get(key)!.add(type);
	}
	return (type: unknown) => {
		if (typeof type !== 'string') return type;
		const key = type.toLowerCase();
		const owners = subTypeOwners.get(key);
		return types.get(key) ?? (owners?.size === 1 ? [...owners][0] : type);
	};
}

/** `data` is a dataset with removed products and word lists already merged (unpacked). */
export function buildMinimalDataset(data: StoredData): MinimalDataset {
	const schema = data.schema ?? [...LEGACY_HEADERS];
	const products: MinimalDataset['products'] = {};
	const removed = new Set<string>();
	for (const [id, product] of Object.entries(data.products ?? {})) {
		if (!product || !Array.isArray(product.values)) continue;
		// Rows are positional, so a dataset with another column order is read through its own schema
		const aligned = LEGACY_HEADERS.map((column) => product.values![schema.indexOf(column)] ?? null);
		const values = minimalValues(upgradeStoredValues(aligned));
		if (!values) continue;
		products[id] = { values };
		if (product.meta?.removedFromSelection) removed.add(id);
	}
	const toCurrentType = legacyTypeMapper(
		Object.entries(products)
			.filter(([id]) => !removed.has(id))
			.map(([, product]) => product)
	);
	for (const id of removed) {
		const values = products[id].values;
		values[TYYPPI] = toCurrentType(values[TYYPPI]) as string | null;
	}
	return {
		schema: MINIMAL_COLUMNS,
		metadata: { LastUpdated: data.metadata?.LastUpdated ?? new Date().toISOString() },
		products
	};
}

if (import.meta.main) {
	const args = process.argv.slice(2);
	const dev = args.includes('--dev');
	const option = (name: string, fallback: string) => {
		const i = args.indexOf(name);
		return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
	};
	const dataPath = option('--data', dev ? './static/data.json' : './data.json');
	const outPath = option('--out', dev ? './static/data.minimal.json' : './data.minimal.json');

	const data = await readStoredDataset<StoredData>(dataPath);
	if (!data) {
		console.error(`❌ ${dataPath} not found`);
		process.exit(1);
	}
	const minimal = buildMinimalDataset(data);
	const json = JSON.stringify(minimal);
	await Bun.write(outPath, json);
	console.log(
		`✅ ${outPath}: ${Object.keys(minimal.products).length} products, ` +
			`${(json.length / 1e6).toFixed(2)} MB (from ${Object.keys(data.products ?? {}).length})`
	);
}

/**
 * Writes `labels.en.json` and `labels.sv.json`: English and Swedish versions of the dataset's
 * Finnish values (categories, countries, taste words, notes…) and of the product names Alko
 * translates. The app loads the file for the language in use (src/lib/i18n/values.ts);
 * data.json itself stays Finnish.
 *
 *   bun run scripts/i18n/labels.ts [--dev] [--detail-limit 150]
 *
 * Runs after the sync and is best-effort: when Alko's English or Swedish data can't be
 * fetched, nothing is written and the previous files stay in place.
 *
 * Most labels come from the search API, swept once per language. Beer styles, notes and
 * regions are only in the per-product detail API, so those are fetched for a sample product of
 * each value that has no translation yet, at most `--detail-limit` products per run. The
 * previous files are merged in, so values of removed products keep their translations and the
 * detail fetches only cover what's new.
 */
import { DEV, REQUEST_HEADERS, SEARCH_URL, productDetailsUrl } from '../data/constants.ts';
import { DATA_PATH } from '../data/dataset-file.ts';
import { readNumberOption } from '../lib/cli.ts';
import {
	FOOD_PAIRING_LABELS,
	FOOD_PAIRING_TRANSLATIONS
} from '../../src/lib/utils/catalog/food.ts';
import {
	PairCounter,
	detailRegionLabel,
	labelKey,
	regionLabel,
	searchLabels,
	sortRecord,
	splitSet,
	splitWords
} from './pairing.ts';

const LANGUAGES = ['en', 'sv'] as const;
type Language = (typeof LANGUAGES)[number];

const OUT_DIR = DEV ? './static' : '.';
const labelsPath = (language: Language) => `${OUT_DIR}/labels.${language}.json`;

const PAGE_SIZE = 1000;
/** The same seed as the sync (scripts/data/index.ts), for deterministic, duplicate-free paging. */
const SEARCH_SEED = 1337;
const SEARCH_CONCURRENCY = 3;
const DETAIL_CONCURRENCY = 4;
const MAX_RETRIES = 5;
const DETAIL_LIMIT = readNumberOption('--detail-limit', 150);

/** Values Alko has no translation for at all, filled in by hand. Alko's own wins when it has one. */
const MANUAL_LABELS: Record<Language, Record<string, string>> = {
	en: {},
	sv: { biodynaaminen: 'Biodynamisk' }
};

type LabelsFile = {
	generated: string;
	/** Translations by lowercased Finnish value. */
	labels: Record<string, string>;
	/** Product names by product number, only where they differ from the Finnish one. */
	names: Record<string, string>;
};

type SearchProduct = Record<string, unknown> & { id: string; name?: string; taste?: string };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJson<T>(url: string, init: RequestInit = {}): Promise<T | null> {
	for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
		try {
			const response = await fetch(url, { ...init, headers: REQUEST_HEADERS });
			if (response.status === 404) return null;
			if (response.ok) return (await response.json()) as T;
			if (response.status !== 403 && response.status !== 429) throw new Error(`${response.status}`);
		} catch (error) {
			if (attempt === MAX_RETRIES) {
				console.warn(`  ⚠️  ${url} failed: ${error instanceof Error ? error.message : error}`);
				return null;
			}
		}
		await sleep(Math.min(1000 * 2 ** attempt, 30_000) + Math.random() * 500);
	}
	return null;
}

/** The whole catalogue in one language, or null when any page failed. */
async function sweep(language: string): Promise<Map<string, SearchProduct> | null> {
	const page = (skip: number) =>
		fetchJson<{ '@odata.count'?: number; value?: SearchProduct[] }>(
			`${SEARCH_URL}?lang=${language}`,
			{ method: 'POST', body: JSON.stringify({ top: PAGE_SIZE, skip, seed: SEARCH_SEED }) }
		);
	const first = await page(0);
	const total = first?.['@odata.count'];
	if (!first || typeof total !== 'number') return null;
	const byId = new Map<string, SearchProduct>();
	for (const product of first.value ?? []) byId.set(product.id, product);
	const pages = Math.ceil(total / PAGE_SIZE);
	for (let start = 1; start < pages; start += SEARCH_CONCURRENCY) {
		const batch = Array.from(
			{ length: Math.min(SEARCH_CONCURRENCY, pages - start) },
			(_, i) => start + i
		);
		const results = await Promise.all(batch.map((index) => page(index * PAGE_SIZE)));
		if (results.some((result) => result === null)) return null;
		for (const result of results)
			for (const product of result!.value ?? []) byId.set(product.id, product);
		await sleep(300);
	}
	console.log(`  🌐 ${language}: ${byId.size}/${total} products`);
	return byId.size >= total ? byId : null;
}

async function readLabels(language: Language): Promise<LabelsFile | null> {
	try {
		const file = Bun.file(labelsPath(language));
		if (!(await file.exists())) return null;
		const parsed = (await file.json()) as Partial<LabelsFile>;
		return { generated: '', labels: parsed.labels ?? {}, names: parsed.names ?? {} };
	} catch {
		return null;
	}
}

type Dataset = {
	schema: string[];
	products: Record<string, { values: unknown[]; meta?: { removedFromSelection?: string } }>;
};

/** Pairs the search payloads of one language with the Finnish ones. */
function pairSearch(
	finnish: Map<string, SearchProduct>,
	translated: Map<string, SearchProduct>,
	counter: PairCounter,
	names: Record<string, string>
) {
	for (const [id, fiProduct] of finnish) {
		const product = translated.get(id);
		if (!product) continue;
		const fiLabels = searchLabels(fiProduct);
		for (const [key, label] of searchLabels(product)) counter.add(fiLabels.get(key), label);
		counter.addAligned(splitWords(fiProduct.taste), splitWords(product.taste));
		const fiName = typeof fiProduct.name === 'string' ? fiProduct.name.trim() : '';
		const name = typeof product.name === 'string' ? product.name.trim() : '';
		if (fiName && name && name !== fiName) names[id] = name;
		else delete names[id];
	}
}

/** The Finnish detail-only values in the dataset, with an active product carrying each. */
function detailOnlyValues(dataset: Dataset) {
	const column = (name: string) => dataset.schema.indexOf(name);
	const columns = {
		type: column('Tyyppi'),
		subType: column('Alatyyppi'),
		style: column('Oluttyyppi'),
		note: column('Huomautus'),
		region: column('Alue')
	};
	const values = new Map<string, string>();
	for (const [id, product] of Object.entries(dataset.products)) {
		if (product.meta?.removedFromSelection) continue;
		const { values: row } = product;
		const candidates = [
			row[columns.type],
			row[columns.subType],
			row[columns.style],
			regionLabel(row[columns.region]),
			...splitSet(row[columns.note])
		];
		for (const value of candidates) {
			if (typeof value === 'string' && value.trim() && !values.has(labelKey(value)))
				values.set(labelKey(value), id);
		}
	}
	return { values, columns };
}

type Detail = {
	mainGroup?: string;
	category?: string;
	flavorTag?: { text?: string };
	moreInfo?: string;
	productionSites?: unknown;
};

/** Pairs a product's stored Finnish values with its detail payload in one language. */
function pairDetail(
	row: unknown[],
	columns: Record<string, number>,
	detail: Detail,
	counter: PairCounter
) {
	const text = (value: unknown) => (typeof value === 'string' ? value : undefined);
	counter.add(text(row[columns.type]), detail.mainGroup);
	counter.add(text(row[columns.subType]), detail.category);
	counter.add(text(row[columns.style]), detail.flavorTag?.text);
	counter.add(regionLabel(row[columns.region]), detailRegionLabel(detail.productionSites));
	counter.addAligned(splitSet(row[columns.note]), splitSet(detail.moreInfo));
}

async function mapWithConcurrency<T>(
	items: T[],
	limit: number,
	worker: (item: T) => Promise<void>
) {
	let cursor = 0;
	await Promise.all(
		Array.from({ length: Math.min(limit, items.length) }, async () => {
			while (cursor < items.length) await worker(items[cursor++]!);
		})
	);
}

async function main() {
	console.log('🌍 Building value translations…');
	const dataset = (await Bun.file(DATA_PATH).json()) as Dataset;
	const finnish = await sweep('fi');
	if (!finnish) throw new Error('The Finnish search sweep failed');

	const { values: detailValues, columns } = detailOnlyValues(dataset);

	for (const language of LANGUAGES) {
		const translated = await sweep(language);
		if (!translated) {
			console.warn(`  ⚠️  ${language}: search sweep incomplete, keeping the previous file`);
			process.exitCode = 1;
			continue;
		}
		const previous = await readLabels(language);
		const counter = new PairCounter();
		const names = { ...previous?.names };
		pairSearch(finnish, translated, counter, names);
		// Taste lists of different lengths, once the aligned ones have taught most of the words
		for (const [id, fiProduct] of finnish) {
			const product = translated.get(id);
			if (product) counter.addByElimination(splitWords(fiProduct.taste), splitWords(product.taste));
		}

		// Food pairings: only on Alko's own pages, kept by hand in food.ts
		for (const [id, label] of Object.entries(FOOD_PAIRING_LABELS)) {
			counter.add(label, FOOD_PAIRING_TRANSLATIONS[language][id]);
		}

		// Detail-only values without a translation yet, one sample product each
		const known = new Set([
			...Object.keys(previous?.labels ?? {}),
			...Object.keys(counter.result())
		]);
		const missing = [...detailValues].filter(([key]) => !known.has(key) && !counter.has(key));
		const productIds = [...new Set(missing.map(([, id]) => id))].slice(0, DETAIL_LIMIT);
		let fetched = 0;
		await mapWithConcurrency(productIds, DETAIL_CONCURRENCY, async (id) => {
			const response = await fetchJson<{ data?: Detail }>(
				`${productDetailsUrl(id)}?lang=${language}`
			);
			const product = dataset.products[id];
			if (!response?.data || !product) return;
			pairDetail(product.values, columns, response.data, counter);
			fetched++;
		});
		console.log(
			`  🔎 ${language}: ${missing.length} detail-only values untranslated, fetched ${fetched}/${productIds.length} products`
		);

		// This run's pairs win; values only seen before (removed products) keep their translation
		const labels = { ...MANUAL_LABELS[language], ...previous?.labels, ...counter.result() };
		const file: LabelsFile = {
			generated: new Date().toISOString(),
			labels: sortRecord(labels),
			names: sortRecord(names)
		};
		await Bun.write(labelsPath(language), JSON.stringify(file));
		console.log(
			`  ✅ ${labelsPath(language)}: ${Object.keys(file.labels).length} labels, ${Object.keys(file.names).length} names`
		);
	}
}

main().catch((error) => {
	console.error('❌ Building value translations failed:', error);
	process.exit(1);
});

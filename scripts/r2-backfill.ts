import path from 'node:path';
import { R2S3Client } from './r2';
import { ogPlaceholderPng } from './og-placeholder';
import {
	OG_KEY_PREFIX,
	ogDesignFingerprint,
	ogDisplayFields,
	ogImageKey,
	ogSvg,
	svgToPng
} from './og';

/**
 * Backfills R2 with every OG image the current dataset expects but that is
 * missing from the bucket. This heals against past import runs where uploads
 * failed partway but the manifest — which only tracked content-addressed keys —
 * still got deployed referencing objects that were never uploaded.
 *
 * It renders a product unless its content-addressed key already exists in the
 * bucket, uploads any missing objects, and writes an up-to-date `og-images.json`
 * mapping each product id to the key currently served.
 */

const REQUEST_HEADERS = {
	'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:147.0) Gecko/20100101 Firefox/147.0'
};

const MANIFEST_FILE = 'og-images.json';

type Dataset = { schema?: string[]; products?: Record<string, { values?: unknown[] }> };
type Manifest = Record<string, string>;

function readOption(name: string): string | undefined {
	const index = process.argv.indexOf(name);
	return index === -1 ? undefined : process.argv[index + 1];
}

function readNumberOption(name: string, fallback: number): number {
	const value = Number(readOption(name));
	return Number.isInteger(value) && value > 0 ? value : fallback;
}

/** Downloads the Alko product photo; returns `null` when the product has no photo. */
async function fetchProductImage(id: string): Promise<ArrayBuffer | null> {
	const url = `https://images.alko.fi/images/cs_srgb,f_auto,t_medium/cdn/${encodeURIComponent(id)}/kuva.jpg`;
	let lastError: unknown;
	for (let attempt = 0; attempt < 5; attempt += 1) {
		try {
			const response = await fetch(url, {
				headers: REQUEST_HEADERS,
				signal: AbortSignal.timeout(30_000)
			});
			// No photo exists for this product — callers fall back to a
			// placeholder rather than failing the product forever.
			if (response.status >= 400 && response.status < 500) return null;
			if (!response.ok) throw new Error(`Alko image HTTP ${response.status}`);
			return await response.arrayBuffer();
		} catch (error) {
			lastError = error;
			await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
		}
	}
	throw lastError instanceof Error ? lastError : new Error('image fetch failed');
}

/** Runs `fn` over `items` with at most `limit` concurrent workers. */
async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
	const results = new Array<R>(items.length);
	let next = 0;
	async function worker() {
		while (next < items.length) {
			const index = next;
			next += 1;
			results[index] = await fn(items[index]);
		}
	}
	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
	return results;
}

const accessKeyId = process.env.CF_R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.CF_R2_SECRET_ACCESS_KEY;
const accountId = process.env.CF_R2_ACCOUNT_ID;
const bucket = process.env.CF_R2_BUCKET ?? 'alkometriikka-og';
const region = process.env.CF_R2_REGION;

if (!accessKeyId || !secretAccessKey || !accountId) {
	throw new Error('Set CF_R2_ACCESS_KEY_ID, CF_R2_SECRET_ACCESS_KEY and CF_R2_ACCOUNT_ID in .env');
}

const client = new R2S3Client({ accessKeyId, secretAccessKey, accountId, bucket, region });

const dataPath = path.resolve(readOption('--data') ?? 'static/data.json');
const concurrency = readNumberOption('--concurrency', Number(process.env.OG_CONCURRENCY) || 16);

const dataset = (await Bun.file(dataPath).json()) as Dataset;
const schema = dataset.schema ?? [];
const products = Object.entries(dataset.products ?? {});
if (products.length === 0) throw new Error(`No products found in ${dataPath}`);
const design = await ogDesignFingerprint();

const existing = new Set(await client.listKeys(`${OG_KEY_PREFIX}/`));
console.log(`Bucket already has ${existing.size} object(s) under ${OG_KEY_PREFIX}/`);

const manifest: Manifest = {};
const queue: Array<{ id: string; values: unknown[] }> = [];
for (const [id, product] of products) {
	if (!product || !Array.isArray(product.values)) continue;
	const display = ogDisplayFields(schema, product.values);
	if (!display) continue;
	const key = ogImageKey(display, design);
	manifest[id] = key;
	if (!existing.has(key)) queue.push({ id, values: product.values });
}
console.log(`${products.length} products, ${queue.length} missing image(s) to render and upload`);

let uploaded = 0;
let failed = 0;
const failures: string[] = [];
const started = Date.now();
await mapPool(queue, concurrency, async ({ id, values }) => {
	try {
		const display = ogDisplayFields(schema, values);
		if (!display) throw new Error('invalid display');
		const image = await fetchProductImage(id);
		const svg = await ogSvg(display, image ?? ogPlaceholderPng(display.name));
		const png = svgToPng(svg);
		const key = ogImageKey(display, design);
		await client.putObject(key, Buffer.from(png));
		uploaded += 1;
	} catch (error) {
		failed += 1;
		failures.push(`${id}: ${error instanceof Error ? error.message : String(error)}`);
	}
	if ((uploaded + failed) % 200 === 0 || uploaded + failed === queue.length) {
		const elapsed = ((Date.now() - started) / 1000).toFixed(0);
		console.log(`  ... ${uploaded}/${queue.length} uploaded (${failed} failed) after ${elapsed}s`);
	}
});

await Bun.write(MANIFEST_FILE, JSON.stringify(manifest));
console.log(`Backfill done: ${uploaded} uploaded, ${failed} failed | manifest → ${MANIFEST_FILE}`);
if (failures.length > 0) {
	for (const failure of failures.slice(0, 20)) console.warn(`    ✗ ${failure}`);
	console.warn(`    … and ${failures.length - Math.min(failures.length, 20)} more`);
}

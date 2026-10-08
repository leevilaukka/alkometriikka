import path from 'node:path';
import { R2S3Client } from '../r2/client';
import { ogPlaceholderPng } from './og-placeholder';
import {
	OG_KEY_PREFIX,
	ogDesignFingerprint,
	ogDisplayFields,
	ogImageKey,
	ogSvg,
	svgToPng
} from './og';
import { readOption, readNumberOption } from '../lib/cli';
import { mapPool } from '../lib/async';
import { fetchProductImage as fetchAlkoImage } from '../lib/alko-image';

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

const fetchProductImage = (id: string) =>
	fetchAlkoImage(id, {
		attempts: 5,
		timeoutMs: 30_000,
		backoffMs: (attempt) => 1000 * 2 ** attempt
	});

const MANIFEST_FILE = 'og-images.json';

type Dataset = { schema?: string[]; products?: Record<string, { values?: unknown[] }> };
type Manifest = Record<string, string>;

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

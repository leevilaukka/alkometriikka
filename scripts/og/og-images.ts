import { mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import Bun from 'bun';
import {
	OG_KEY_PREFIX,
	ogDesignFingerprint,
	ogDisplayFields,
	ogImageKey,
	ogSvg,
	svgToPng
} from './og';
import { R2S3Client } from '../r2/client';
import { ogPlaceholderPng } from './og-placeholder';

const REQUEST_HEADERS = {
	'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:147.0) Gecko/20100101 Firefox/147.0'
};

const MANIFEST_FILE = 'og-images.json';

type ProductRecord = { values?: unknown[] };
type Dataset = { schema?: string[]; products?: Record<string, ProductRecord> };
type Manifest = Record<string, string>;

function readOption(name: string): string | undefined {
	const index = process.argv.indexOf(name);
	return index === -1 ? undefined : process.argv[index + 1];
}

function readNumberOption(name: string, fallback: number): number {
	const value = Number(readOption(name));
	return Number.isInteger(value) && value > 0 ? value : fallback;
}

function hasFlag(name: string): boolean {
	return process.argv.includes(name);
}

async function fetchProductImage(id: string): Promise<ArrayBuffer | null> {
	const url = `https://images.alko.fi/images/cs_srgb,f_auto,t_medium/cdn/${encodeURIComponent(id)}/kuva.jpg`;
	let lastError: unknown;
	for (let attempt = 0; attempt < 3; attempt += 1) {
		try {
			const response = await fetch(url, {
				headers: REQUEST_HEADERS,
				signal: AbortSignal.timeout(20_000)
			});
			// No photo exists for this product — callers fall back to a
			// placeholder rather than failing the product forever.
			if (response.status >= 400 && response.status < 500) return null;
			if (!response.ok) throw new Error(`Alko image HTTP ${response.status}`);
			return await response.arrayBuffer();
		} catch (error) {
			lastError = error;
			await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
		}
	}
	throw lastError instanceof Error ? lastError : new Error('image fetch failed');
}

async function readManifest(pathName: string): Promise<Manifest> {
	try {
		return (await Bun.file(pathName).json()) as Manifest;
	} catch {
		return {};
	}
}

async function readDataset(pathName: string): Promise<Dataset> {
	try {
		return (await Bun.file(pathName).json()) as Dataset;
	} catch {
		return {};
	}
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

/**
 * Renders an error with as much diagnostic detail as it carries — name, any
 * `code` an S3/R2 client attaches, and a `cause` chain — instead of just
 * `.message`, which for Bun's S3 client is often a useless, generic
 * "an unexpected error has occurred" with no indication of what failed.
 */
function describeError(error: unknown): string {
	if (!(error instanceof Error)) return String(error);
	const code = (error as { code?: unknown }).code;
	const parts = [`${error.name}: ${error.message}`];
	if (code !== undefined) parts.push(`code=${String(code)}`);
	if (error.cause !== undefined) {
		parts.push(`cause=${error.cause instanceof Error ? describeError(error.cause) : String(error.cause)}`);
	}
	return parts.join(' | ');
}

/** Lists keys under `prefix`, retrying transient failures a couple of times. */
async function listKeysWithRetry(client: R2S3Client, prefix: string): Promise<string[]> {
	let lastError: unknown;
	for (let attempt = 1; attempt <= 3; attempt += 1) {
		try {
			return await client.listKeys(prefix);
		} catch (error) {
			lastError = error;
			if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
		}
	}
	throw lastError;
}

/**
 * Deletes every object not in `keep`. Never throws: each deletion is
 * isolated (one flaky DELETE can't abort the rest of a multi-thousand-object
 * batch) and a failed `listKeys` just skips the run with a diagnosable
 * warning, to be retried next cycle.
 */
async function pruneTo(client: R2S3Client, keep: Set<string>, poolSize: number): Promise<void> {
	let stale: string[];
	try {
		const existing = await listKeysWithRetry(client, `${OG_KEY_PREFIX}/`);
		stale = existing.filter((key) => !keep.has(key));
	} catch (error) {
		console.warn(`⚠️  Prune skipped (could not list bucket): ${describeError(error)}`);
		return;
	}
	if (stale.length === 0) return;

	let deleted = 0;
	const failedKeys: string[] = [];
	await mapPool(stale, poolSize, async (key) => {
		try {
			await client.deleteObject(key);
			deleted += 1;
		} catch (error) {
			failedKeys.push(key);
			if (failedKeys.length <= 5) console.warn(`  ✗ prune ${key}: ${describeError(error)}`);
		}
	});
	console.log(
		`Pruned ${deleted}/${stale.length} object(s)` +
			(failedKeys.length > 0 ? ` — ${failedKeys.length} failed to delete` : '')
	);
}

async function main() {
	const dataPath = path.resolve(readOption('--data') ?? 'static/data.json');
	const renderDir = readOption('--render'); // render-only mode
	const uploadDir = readOption('--upload'); // upload-only mode
	const explicitManifest = readOption('--manifest');
	const limit = readNumberOption('--limit', 0);
	const poolSize = readNumberOption('--concurrency', 16);
	const localOnly = hasFlag('--local');

	if (localOnly && uploadDir) throw new Error('--local cannot be combined with --upload');
	if (localOnly && !renderDir)
		throw new Error('--local requires --render <dir> (nothing would be rendered)');

	const accessKeyId = process.env.CF_R2_ACCESS_KEY_ID;
	const secretAccessKey = process.env.CF_R2_SECRET_ACCESS_KEY;
	const accountId = process.env.CF_R2_ACCOUNT_ID;
	const bucket = process.env.CF_R2_BUCKET || 'alkometriikka-og';
	const region = process.env.CF_R2_REGION;

	const uploadEnabled = !localOnly && Boolean(accessKeyId && secretAccessKey && accountId);
	let client: R2S3Client | null = null;
	if (uploadEnabled) {
		client = new R2S3Client({
			accessKeyId: accessKeyId!,
			secretAccessKey: secretAccessKey!,
			accountId: accountId!,
			bucket,
			region
		});
	}

	if (!renderDir && !uploadDir && !client) {
		throw new Error(
			'Nothing to do: pass --render <dir> to render locally, --upload <dir> to push a render dir, or set CF_R2_ACCESS_KEY_ID + CF_R2_SECRET_ACCESS_KEY + CF_R2_ACCOUNT_ID to render-and-upload changed products.'
		);
	}

	/* ------------------------------------------------------------------ *
	 * Upload-only: push every PNG in a render dir so the bucket matches    *
	 * its manifest, then prune objects for products that left the dataset. *
	 * ------------------------------------------------------------------ */
	if (uploadDir) {
		if (!client)
			throw new Error(
				'--upload requires CF_R2_ACCESS_KEY_ID, CF_R2_SECRET_ACCESS_KEY and CF_R2_ACCOUNT_ID'
			);
		const uploadManifest = path.resolve(explicitManifest ?? path.join(uploadDir, MANIFEST_FILE));
		const manifest = await readManifest(uploadManifest);
		const desired = new Set(Object.values(manifest));
		const productsDir = path.join(uploadDir, OG_KEY_PREFIX);
		let files: string[] = [];
		try {
			files = (await readdir(productsDir)).filter((name) => name.endsWith('.png')).sort();
		} catch {
			/* no rendered files yet */
		}
		if (files.length === 0) throw new Error(`No PNG files found under ${productsDir}`);

		const uploads = files
			.map((file) => `${OG_KEY_PREFIX}/${file}`)
			.filter((key) => desired.has(key));
		const skipped = files.length - uploads.length;

		let uploaded = 0;
		let failed = 0;
		const total = uploads.length;
		await mapPool(uploads, poolSize, async (key) => {
			try {
				const png = await Bun.file(path.join(uploadDir, ...key.split('/'))).arrayBuffer();
				await client!.putObject(key, Buffer.from(png));
				uploaded += 1;
			} catch (error) {
				failed += 1;
				console.error(`  ✗ ${key}: ${error instanceof Error ? error.message : String(error)}`);
			}
			if ((uploaded + failed) % 500 === 0 || uploaded + failed === total) {
				console.log(`  ... ${uploaded}/${total} uploaded (${failed} failed)`);
			}
		});

		if (skipped > 0) console.log(`Skipped ${skipped} file(s) not referenced by the manifest`);

		if (failed === 0) {
			const dataset = await readDataset(dataPath);
			const keep = new Set(desired);
			for (const id of Object.keys(dataset.products ?? {})) {
				const previousKey = manifest[id];
				if (previousKey !== undefined) keep.add(previousKey);
			}
			await pruneTo(client!, keep, poolSize);
			console.log(
				`Upload complete: ${uploaded} uploaded, ${failed} failed | manifest → ${uploadManifest}`
			);
		} else {
			console.warn(`⚠️  ${failed} upload(s) failed — skipping prune`);
		}
		return;
	}

	/* ------------------------------------------------------------------ *
	 * Render-only, or render changed products and upload them (CI).        *
	 * ------------------------------------------------------------------ */
	const manifestPath = path.resolve(
		explicitManifest ?? (renderDir ? path.join(renderDir, MANIFEST_FILE) : MANIFEST_FILE)
	);
	const previous = await readManifest(manifestPath);

	const dataset = await readDataset(dataPath);
	const products = Object.entries(dataset.products ?? {});
	if (products.length === 0) throw new Error(`No products found in ${dataPath}`);
	const schema = dataset.schema ?? [];
	const design = await ogDesignFingerprint();

	// Only objects that actually exist in R2 may be carried over from the
	// previous manifest. A content-addressed key that isn't in the bucket (e.g.
	// an earlier upload that failed but still got recorded) is re-queued here,
	// so the manifest can never reference a missing object: a partially failed
	// run drops the un-uploaded products and the next run heals them automatically.
	let existing: Set<string> | null = null;
	if (client) {
		existing = new Set(await client.listKeys(`${OG_KEY_PREFIX}/`));
	}

	const current: Manifest = {};
	const queue: Array<{ id: string; values: unknown[] }> = [];
	for (const [id, product] of products) {
		if (!product || !Array.isArray(product.values)) continue;
		if (limit > 0 && queue.length >= limit) break;
		const display = ogDisplayFields(schema, product.values);
		if (!display) continue;
		const key = ogImageKey(display, design);
		if (previous[id] === key && (existing === null || existing.has(key))) {
			current[id] = key;
			continue;
		}
		queue.push({ id, values: product.values });
	}
	// Products not queued this run (unchanged, capped by --limit, or with a
	// prior image) keep their previous key so nothing valid is ever lost — but
	// only when the object still exists in the bucket.
	for (const [id] of products) {
		if (
			current[id] === undefined &&
			previous[id] !== undefined &&
			(existing === null || existing.has(previous[id]))
		) {
			current[id] = previous[id];
		}
	}

	if (renderDir) await mkdir(renderDir, { recursive: true });

	const targetManifest = renderDir ? path.join(renderDir, MANIFEST_FILE) : manifestPath;
	let flushing = false;
	// Best-effort snapshot of progress; the authoritative write happens at the end.
	async function flushManifest(): Promise<void> {
		if (flushing) return;
		flushing = true;
		try {
			await Bun.write(targetManifest, JSON.stringify(current));
		} catch {
			/* best-effort */
		} finally {
			flushing = false;
		}
	}
	const flushInterval = setInterval(() => void flushManifest(), 15_000);
	const onSignal = () => {
		console.log('\nInterrupted — writing manifest so the run can resume...');
		clearInterval(flushInterval);
		void flushManifest().finally(() => process.exit(130));
	};
	process.on('SIGINT', onSignal);
	process.on('SIGTERM', onSignal);

	const failures: string[] = [];
	let processed = 0;
	await mapPool(queue, poolSize, async (entry) => {
		const { id, values } = entry;
		try {
			const display = ogDisplayFields(schema, values);
			if (!display) throw new Error('invalid display');
			const image = await fetchProductImage(id);
			const svg = await ogSvg(display, image ?? ogPlaceholderPng(display.name));
			const png = svgToPng(svg);
			const key = ogImageKey(display, design);

			if (renderDir) {
				const filePath = path.join(renderDir, ...key.split('/'));
				await mkdir(path.dirname(filePath), { recursive: true });
				await Bun.write(filePath, png);
			}
			if (client) {
				await client.putObject(key, Buffer.from(png));
			}
			current[id] = key;
		} catch (error) {
			failures.push(`${id}: ${error instanceof Error ? error.message : String(error)}`);
		}
		processed += 1;
		if (processed % 500 === 0 || processed === queue.length) {
			console.log(`  ... ${processed}/${queue.length} rendered`);
			await flushManifest();
		}
	});

	clearInterval(flushInterval);
	process.off('SIGINT', onSignal);
	process.off('SIGTERM', onSignal);

	if (client) {
		// Only delete objects no manifest has ever referenced. Adding *every*
		// previous key (not just the ones still in the dataset) means a run
		// against a partial/incomplete dataset can never prune images that the
		// deployed site still uses — which is exactly how the bucket's storage
		// collapsed in the first place. Prune = delete true garbage only.
		//
		// This is why prune can safely run even when `failures.length > 0`: a
		// failed product's old key is already protected via `previous`, so a
		// handful of flaky image fetches (routine at this scale, against an
		// external CDN) can never make prune unsafe — only pointless if gated
		// on zero failures, which is what silently blocked cleanup here.
		const wanted = new Set(Object.values(current));
		for (const previousKey of Object.values(previous)) wanted.add(previousKey);
		await pruneTo(client, wanted, poolSize);
	}

	await Bun.write(targetManifest, JSON.stringify(current));
	console.log(
		`OG images ready: ${Object.keys(current).length} products, ${queue.length} regenerated, ${failures.length} failed | manifest → ${targetManifest}`
	);
	if (failures.length > 0) {
		for (const failure of failures) console.warn(`    ✗ ${failure}`);
	}
}

await main();

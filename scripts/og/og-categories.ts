import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import Bun from 'bun';
import { svgToPng } from './og';
import {
	CATEGORY_OG_KEY_PREFIX,
	CATEGORY_OG_MANIFEST_FILE,
	categoryOgDesignFingerprint,
	categoryOgDisplays,
	categoryOgKey,
	categoryOgSvg,
	type CategoryOgManifest
} from './og-category-card';
import { R2S3Client } from '../r2/client';
import { hasFlag, readNumberOption, readOption } from '../lib/cli';
import { mapPool } from '../lib/async';

/**
 * Renders the category page OG cards and uploads them to R2 under
 * `categories/`, writing `og-categories.json` (page path → key) for the
 * prerender. Separate from og-images.ts on purpose: its own key prefix,
 * manifest and fingerprint, so nothing here can re-key or prune a product image.
 *
 *   bun run scripts/og/og-categories.ts --render <dir> --local   # render only
 *   bun run scripts/og/og-categories.ts --manifest <file>        # CI: render changed + upload
 *
 * Keys are content-addressed (the displayed numbers + the card design), so only
 * cards whose numbers changed are re-rendered. There are ~100 of them and no
 * network fetches, so a full re-render is cheap anyway.
 */

type Dataset = { schema?: string[]; products?: Record<string, { values?: unknown[] }> };

async function readJson<T>(pathName: string, fallback: T): Promise<T> {
	try {
		return (await Bun.file(pathName).json()) as T;
	} catch {
		return fallback;
	}
}

async function main() {
	const dataPath = path.resolve(readOption('--data') ?? 'static/data.json');
	const renderDir = readOption('--render');
	const explicitManifest = readOption('--manifest');
	const poolSize = readNumberOption('--concurrency', 8);
	const localOnly = hasFlag('--local');

	if (localOnly && !renderDir)
		throw new Error('--local requires --render <dir> (nothing would be rendered)');

	const accessKeyId = process.env.CF_R2_ACCESS_KEY_ID;
	const secretAccessKey = process.env.CF_R2_SECRET_ACCESS_KEY;
	const accountId = process.env.CF_R2_ACCOUNT_ID;
	const client =
		!localOnly && accessKeyId && secretAccessKey && accountId
			? new R2S3Client({
					accessKeyId,
					secretAccessKey,
					accountId,
					bucket: process.env.CF_R2_BUCKET || 'alkometriikka-og',
					region: process.env.CF_R2_REGION
				})
			: null;

	if (!renderDir && !client) {
		throw new Error(
			'Nothing to do: pass --render <dir> to render locally, or set CF_R2_ACCESS_KEY_ID + CF_R2_SECRET_ACCESS_KEY + CF_R2_ACCOUNT_ID to render and upload.'
		);
	}

	const manifestPath = path.resolve(
		explicitManifest ??
			(renderDir ? path.join(renderDir, CATEGORY_OG_MANIFEST_FILE) : CATEGORY_OG_MANIFEST_FILE)
	);
	const previous = await readJson<CategoryOgManifest>(manifestPath, {});

	const dataset = await readJson<Dataset>(dataPath, {});
	const products = Object.values(dataset.products ?? {});
	if (products.length === 0) throw new Error(`No products found in ${dataPath}`);
	const displays = categoryOgDisplays(dataset.schema ?? [], products);
	const design = await categoryOgDesignFingerprint();

	// Only keys that exist in the bucket may be carried over, so the manifest never
	// points at a missing object (the same rule as the product images)
	const existing = client ? new Set(await client.listKeys(`${CATEGORY_OG_KEY_PREFIX}/`)) : null;

	const current: CategoryOgManifest = {};
	const queue = displays.filter((display) => {
		const key = categoryOgKey(display, design);
		if (previous[display.path] === key && (existing === null || existing.has(key))) {
			current[display.path] = key;
			return false;
		}
		return true;
	});

	const failures: string[] = [];
	await mapPool(queue, poolSize, async (display) => {
		try {
			const key = categoryOgKey(display, design);
			const png = svgToPng(await categoryOgSvg(display));
			if (renderDir) {
				const filePath = path.join(path.resolve(renderDir), ...key.split('/'));
				await mkdir(path.dirname(filePath), { recursive: true });
				await Bun.write(filePath, png);
			}
			if (client) await client.putObject(key, Buffer.from(png));
			current[display.path] = key;
		} catch (error) {
			failures.push(`${display.path}: ${error instanceof Error ? error.message : String(error)}`);
			// A failed card keeps its previous image when that still exists
			const previousKey = previous[display.path];
			if (previousKey && (existing === null || existing.has(previousKey)))
				current[display.path] = previousKey;
		}
	});

	if (client) {
		// Keep the previous run's keys too: the deployed pages point at them until
		// this run's prerender is live. Only the `categories/` prefix is ever listed.
		const keep = new Set([...Object.values(current), ...Object.values(previous)]);
		const stale = [...existing!].filter((key) => !keep.has(key));
		let deleted = 0;
		await mapPool(stale, poolSize, async (key) => {
			try {
				await client.deleteObject(key);
				deleted += 1;
			} catch (error) {
				console.warn(`  ✗ prune ${key}: ${error instanceof Error ? error.message : String(error)}`);
			}
		});
		if (stale.length) console.log(`Pruned ${deleted}/${stale.length} stale category card(s)`);
	}

	const sorted = Object.fromEntries(Object.entries(current).sort(([a], [b]) => a.localeCompare(b)));
	await mkdir(path.dirname(manifestPath), { recursive: true });
	await Bun.write(manifestPath, JSON.stringify(sorted));
	console.log(
		`Category OG cards ready: ${Object.keys(sorted).length} pages, ${queue.length - failures.length} rendered, ${failures.length} failed | manifest → ${manifestPath}`
	);
	for (const failure of failures) console.warn(`    ✗ ${failure}`);
}

await main();

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { publishReviewCollection, syncWineReviews } from './wine-reviews.ts';

async function main() {
	const args = process.argv.slice(2);
	let dev = false;
	let force = false;
	let catalogOnly = false;
	let includeRemoved = false;
	let dataPath: string | undefined;
	let outputDir: string | undefined;
	let limit = 200;
	let concurrency = 1;
	const skus = new Set<string>();
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === '--dev') dev = true;
		else if (arg === '--force') force = true;
		else if (arg === '--catalog-only') catalogOnly = true;
		else if (arg === '--include-removed') includeRemoved = true;
		else if (['--data', '--out', '--limit', '--concurrency', '--sku'].includes(arg)) {
			const value = args[++i];
			if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
			if (arg === '--data') dataPath = value;
			else if (arg === '--out') outputDir = value;
			else if (arg === '--limit') {
				if (!/^\d+$/.test(value))
					throw new Error('--limit must be a nonnegative integer (0 means all)');
				limit = Number(value);
			} else if (arg === '--concurrency') {
				if (!/^[1-4]$/.test(value)) throw new Error('--concurrency must be between 1 and 4');
				concurrency = Number(value);
			} else {
				if (!/^\d{6}$/.test(value))
					throw new Error('--sku must be a six-digit Alko product number');
				skus.add(value);
			}
		} else throw new Error(`Unknown argument: ${arg}`);
	}
	const resolvedOutputDir = path.resolve(outputDir ?? (dev ? 'static/reviews' : 'reviews'));
	if (catalogOnly) {
		const collection = await publishReviewCollection(resolvedOutputDir);
		console.log(
			`Review catalog: ${collection.skus.length} SKUs, ${collection.reviews.length} reviews`
		);
		return;
	}
	const catalog = JSON.parse(
		await readFile(path.resolve(dataPath ?? (dev ? 'static/data.json' : 'data.json')), 'utf8')
	);
	await syncWineReviews({
		catalog,
		outputDir: resolvedOutputDir,
		limit,
		skus: skus.size ? skus : undefined,
		force,
		includeRemoved,
		concurrency
	});
}

main().catch((error) => {
	console.error(`Wine review sync failed; existing files are retained: ${String(error)}`);
	process.exitCode = 1;
});

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { syncWineReviews } from './wine-reviews.ts';

async function main() {
	const args = process.argv.slice(2);
	let dev = false;
	let force = false;
	let dataPath: string | undefined;
	let outputDir: string | undefined;
	let limit = 200;
	const skus = new Set<string>();
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === '--dev') dev = true;
		else if (arg === '--force') force = true;
		else if (['--data', '--out', '--limit', '--sku'].includes(arg)) {
			const value = args[++i];
			if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
			if (arg === '--data') dataPath = value;
			else if (arg === '--out') outputDir = value;
			else if (arg === '--limit') {
				if (!/^\d+$/.test(value))
					throw new Error('--limit must be a nonnegative integer (0 means all)');
				limit = Number(value);
			} else {
				if (!/^\d{6}$/.test(value))
					throw new Error('--sku must be a six-digit Alko product number');
				skus.add(value);
			}
		} else throw new Error(`Unknown argument: ${arg}`);
	}
	const catalog = JSON.parse(
		await readFile(path.resolve(dataPath ?? (dev ? 'static/data.json' : 'data.json')), 'utf8')
	);
	await syncWineReviews({
		catalog,
		outputDir: path.resolve(outputDir ?? (dev ? 'static/reviews' : 'reviews')),
		limit,
		skus: skus.size ? skus : undefined,
		force
	});
}

main().catch((error) => {
	console.error(`Wine review sync failed; existing files are retained: ${String(error)}`);
	process.exitCode = 1;
});

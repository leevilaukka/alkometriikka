import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { svgToPng } from './og';
import { dailyOgKey, dailyOgSvg } from './og-daily-card';
import { R2S3Client } from '../r2/client';
import { toISODateInTimeZone } from '../../src/lib/utils/sales';
import { dayNumberForDate } from '../../src/lib/daily/dayNumber';

/**
 * Renders today's generic Daily share card and uploads it to R2 at
 * `daily/<date>.png`. Unlike the product images, there's exactly one object
 * per day (no per-player variants, no content hashing) so this always
 * (re)renders and overwrites — a rerun mid-day is harmless and self-healing
 * if a previous run's upload failed.
 */

function readOption(name: string): string | undefined {
	const index = process.argv.indexOf(name);
	return index === -1 ? undefined : process.argv[index + 1];
}

/** Retries transient R2 blips (matches the backoff shape used for product image fetches). */
async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
	let lastError: unknown;
	for (let attempt = 0; attempt < attempts; attempt += 1) {
		try {
			return await fn();
		} catch (error) {
			lastError = error;
			if (attempt < attempts - 1) {
				await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
			}
		}
	}
	throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function main() {
	const renderDir = readOption('--render');
	const date = readOption('--date') ?? toISODateInTimeZone('Europe/Helsinki');

	const dayNumber = dayNumberForDate(date);
	const svg = await dailyOgSvg({ date, dayNumber });
	const png = svgToPng(svg);
	const key = dailyOgKey(date);

	if (renderDir) {
		const filePath = path.join(path.resolve(renderDir), ...key.split('/'));
		await mkdir(path.dirname(filePath), { recursive: true });
		await Bun.write(filePath, png);
		console.log(`Rendered ${key} (day #${dayNumber}) → ${filePath}`);
	}

	const accessKeyId = process.env.CF_R2_ACCESS_KEY_ID;
	const secretAccessKey = process.env.CF_R2_SECRET_ACCESS_KEY;
	const accountId = process.env.CF_R2_ACCOUNT_ID;
	const bucket = process.env.CF_R2_BUCKET || 'alkometriikka-og';
	const region = process.env.CF_R2_REGION;

	if (accessKeyId && secretAccessKey && accountId) {
		const client = new R2S3Client({ accessKeyId, secretAccessKey, accountId, bucket, region });
		await withRetry(() => client.putObject(key, Buffer.from(png)));
		console.log(`Uploaded ${key} (day #${dayNumber})`);
		return;
	}

	if (!renderDir) {
		throw new Error(
			'Nothing to do: pass --render <dir> to render locally, or set CF_R2_ACCESS_KEY_ID + CF_R2_SECRET_ACCESS_KEY + CF_R2_ACCOUNT_ID to upload.'
		);
	}
}

await main();

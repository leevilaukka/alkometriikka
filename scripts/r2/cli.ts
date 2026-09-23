import { R2S3Client } from './client';
import { DAILY_OG_KEY_PREFIX } from '../og/og-daily-card';
import { dateForDayNumber } from '../../src/lib/daily/dayNumber';

/**
 * Small unified CLI for ad hoc maintenance of the Alkometriikka R2 bucket
 * (`alkometriikka-og`). Wraps `R2S3Client` with the handful of operations
 * that used to live as one-off scripts (count.ts, og-daily-prune.ts):
 * counting/listing objects under a prefix, deleting explicit keys, and
 * pruning old Daily OG cards by date or day number.
 *
 * Usage:
 *   bun run r2 count [prefix]
 *   bun run r2 list [prefix] [--limit n]
 *   bun run r2 rm <key...>
 *   bun run r2 prune-daily --before <YYYY-MM-DD> | --before-game <n> [--delete]
 */

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

/** Positional args, i.e. argv entries that aren't a flag or a flag's value. */
function positionals(...flagsWithValues: string[]): string[] {
	const skip = new Set<number>();
	for (const flag of flagsWithValues) {
		const index = process.argv.indexOf(flag);
		if (index !== -1) skip.add(index + 1);
	}
	return process.argv.slice(3).filter((_, i) => {
		const argvIndex = i + 3;
		return !skip.has(argvIndex) && !process.argv[argvIndex]!.startsWith('--');
	});
}

function clientFromEnv(): R2S3Client {
	const accessKeyId = process.env.CF_R2_ACCESS_KEY_ID;
	const secretAccessKey = process.env.CF_R2_SECRET_ACCESS_KEY;
	const accountId = process.env.CF_R2_ACCOUNT_ID;
	const bucket = process.env.CF_R2_BUCKET || 'alkometriikka-og';
	const region = process.env.CF_R2_REGION;

	if (!accessKeyId || !secretAccessKey || !accountId) {
		throw new Error(
			'Set CF_R2_ACCESS_KEY_ID, CF_R2_SECRET_ACCESS_KEY and CF_R2_ACCOUNT_ID (.env works) to talk to R2.'
		);
	}
	return new R2S3Client({ accessKeyId, secretAccessKey, accountId, bucket, region });
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

async function count(prefix: string): Promise<void> {
	const client = clientFromEnv();
	const start = Date.now();
	const keys = await client.listKeys(prefix);
	const elapsed = ((Date.now() - start) / 1000).toFixed(1);
	console.log(
		`${prefix ? `"${prefix}"` : '(root)'}: ${keys.length.toLocaleString('fi-FI')} object(s) in ${elapsed}s`
	);
}

async function list(prefix: string): Promise<void> {
	const client = clientFromEnv();
	const limit = readNumberOption('--limit', 0);
	const keys = await client.listKeys(prefix);
	const shown = limit > 0 ? keys.slice(0, limit) : keys;
	for (const key of shown) console.log(key);
	if (limit > 0 && keys.length > limit) console.log(`... and ${keys.length - limit} more`);
}

async function rm(keys: string[]): Promise<void> {
	if (keys.length === 0) throw new Error('rm requires at least one key: bun run r2 rm <key...>');
	const client = clientFromEnv();
	const poolSize = readNumberOption('--concurrency', 16);
	let deleted = 0;
	const failed: string[] = [];
	await mapPool(keys, poolSize, async (key) => {
		try {
			await client.deleteObject(key);
			deleted += 1;
			console.log(`  ✓ ${key}`);
		} catch (error) {
			failed.push(key);
			console.warn(`  ✗ ${key}: ${error instanceof Error ? error.message : String(error)}`);
		}
	});
	console.log(`Deleted ${deleted}/${keys.length}` + (failed.length > 0 ? ` — ${failed.length} failed` : ''));
}

const DAILY_KEY_PATTERN = new RegExp(`^${DAILY_OG_KEY_PREFIX}/(\\d{4}-\\d{2}-\\d{2})\\.png$`);

/**
 * Deletes Daily OG cards (`daily/<date>.png`) strictly before a cutoff date
 * or day number. There's exactly one object per day forever, so unlike the
 * product images these never get pruned automatically — old cards just
 * accumulate until pruned by hand.
 */
async function pruneDaily(): Promise<void> {
	const beforeDate = readOption('--before');
	const beforeGame = readOption('--before-game');
	const doDelete = hasFlag('--delete');
	const poolSize = readNumberOption('--concurrency', 16);

	if (!beforeDate && !beforeGame) {
		throw new Error('Pass --before <YYYY-MM-DD> or --before-game <n> to set the cutoff.');
	}
	if (beforeDate && beforeGame) {
		throw new Error('Pass only one of --before or --before-game, not both.');
	}

	const cutoff = beforeDate ?? dateForDayNumber(Number(beforeGame));
	if (!/^\d{4}-\d{2}-\d{2}$/.test(cutoff)) throw new Error(`Invalid cutoff date: ${cutoff}`);

	const client = clientFromEnv();
	const keys = await client.listKeys(`${DAILY_OG_KEY_PREFIX}/`);

	const stale = keys
		.map((key) => ({ key, date: key.match(DAILY_KEY_PATTERN)?.[1] }))
		.filter((entry): entry is { key: string; date: string } => entry.date !== undefined)
		.filter((entry) => entry.date < cutoff)
		.sort((a, b) => a.date.localeCompare(b.date));

	if (stale.length === 0) {
		console.log(`Nothing to prune before ${cutoff}.`);
		return;
	}

	console.log(`${stale.length} object(s) before ${cutoff}:`);
	for (const entry of stale) console.log(`  ${entry.key}`);

	if (!doDelete) {
		console.log(`\nDry run — pass --delete to actually remove these ${stale.length} object(s).`);
		return;
	}

	let deleted = 0;
	const failed: string[] = [];
	await mapPool(stale, poolSize, async ({ key }) => {
		try {
			await client.deleteObject(key);
			deleted += 1;
		} catch (error) {
			failed.push(key);
			console.warn(`  ✗ ${key}: ${error instanceof Error ? error.message : String(error)}`);
		}
	});
	console.log(`\nDeleted ${deleted}/${stale.length} object(s)` + (failed.length > 0 ? ` — ${failed.length} failed` : ''));
}

function usage(): string {
	return `Usage:
  bun run r2 count [prefix]
  bun run r2 list [prefix] [--limit n]
  bun run r2 rm <key...>
  bun run r2 prune-daily --before <YYYY-MM-DD> | --before-game <n> [--delete]`;
}

async function main() {
	const command = process.argv[2];

	switch (command) {
		case 'count':
			return count(positionals()[0] ?? '');
		case 'list':
			return list(positionals('--limit')[0] ?? '');
		case 'rm':
			return rm(positionals('--concurrency'));
		case 'prune-daily':
			return pruneDaily();
		default:
			throw new Error(`Unknown command "${command ?? ''}".\n\n${usage()}`);
	}
}

await main();

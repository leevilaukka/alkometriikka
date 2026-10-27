/**
 * Updates the stock history (docs/data/stock-history.md) from an availability.json:
 *
 *   bun run scripts/data/stock-history.ts --availability availability.json \
 *     --previous ../gh-pages/availability.json --dir ../gh-pages/data/stock
 *
 * `--previous` is the availability the last run saw; without it the store counts
 * update but no arrivals are detected. `--today YYYY-MM-DD` overrides the date.
 *
 * `--demo` (local only) instead fakes a month of history from the current
 * availability into static/data/stock/, for trying the pages that show it.
 */
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { hasFlag, readOption } from '../lib/cli';
import { toISODateInTimeZone } from '../../src/lib/utils/catalog/sales';
import { addDays } from '../../src/lib/utils/catalog/stock';
import { readStockedStores } from '../../src/lib/utils/catalog/availabilityFile';
import { DEV } from './constants.ts';
import { isStockState, stockFiles, updateStockState, type StockState } from './stock.ts';
import type { AvailabilityData } from './types.ts';

const DEMO_DAYS = 30;

async function readJson(file: string | undefined): Promise<unknown> {
	if (!file || !(await Bun.file(file).exists())) return null;
	try {
		return await Bun.file(file).json();
	} catch (error) {
		console.warn(`⚠️  Could not read ${file}:`, error);
		return null;
	}
}

/** Either format of availability.json with its product map unpacked, or null */
function readAvailability(value: unknown): AvailabilityData | null {
	const data = value as (AvailabilityData & { storeIds?: unknown }) | null;
	if (!data || typeof data !== 'object' || typeof data.stores !== 'object') return null;
	const product = readStockedStores(data);
	return product ? { ...data, product } : null;
}

async function writeFiles(dir: string, state: StockState, current: AvailabilityData) {
	const { products, stores } = stockFiles(state, current);
	// Rewritten in full so shards and closed stores that no longer have data disappear
	await rm(path.join(dir, 'products'), { recursive: true, force: true });
	await rm(path.join(dir, 'stores'), { recursive: true, force: true });
	await mkdir(path.join(dir, 'products'), { recursive: true });
	await mkdir(path.join(dir, 'stores'), { recursive: true });
	await Promise.all([
		Bun.write(path.join(dir, 'state.json'), JSON.stringify(state)),
		...[...products].map(([shard, file]) =>
			Bun.write(path.join(dir, 'products', `${shard}.json`), JSON.stringify(file))
		),
		...[...stores].map(([storeId, file]) =>
			Bun.write(path.join(dir, 'stores', `${storeId}.json`), JSON.stringify(file))
		)
	]);
	console.log(
		`✅ Stock history ${state.start}…${state.last}: ${Object.keys(state.counts).length} products in ${products.size} shards, ${stores.size} stores → ${dir}`
	);
}

/**
 * Walks back from today's availability, dropping some stores from each product
 * on earlier days, so counts trend and some products arrive in stores during
 * the month. Deterministic, so reruns give the same history.
 */
function demoState(current: AvailabilityData, today: string): StockState {
	const hash = (text: string) => {
		let value = 2166136261;
		for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 16777619);
		return (value >>> 0) / 2 ** 32;
	};
	const dayOf = (productId: string, storeId: string) =>
		// About one in 25 products arrived in a store during the month
		hash(`${productId}:${storeId}`) < 0.04
			? Math.floor(hash(`${storeId}:${productId}`) * DEMO_DAYS)
			: -1;
	const first = addDays(today, -DEMO_DAYS);
	const availabilityOn = (offset: number): AvailabilityData => ({
		...current,
		product: Object.fromEntries(
			Object.entries(current.product).map(([productId, storeIds]) => [
				productId,
				storeIds.filter((storeId) => dayOf(productId, storeId) < offset)
			])
		)
	});
	// The warm-up runs from `since`, so start it a gap earlier than the month shown
	let state = updateStockState(null, null, availabilityOn(0), addDays(first, -14));
	let previous = availabilityOn(0);
	for (let offset = 0; offset <= DEMO_DAYS; offset++) {
		const day = availabilityOn(offset);
		state = updateStockState(state, previous, day, addDays(first, offset));
		previous = day;
	}
	return state;
}

async function main() {
	const availabilityPath =
		readOption('--availability') ?? (DEV ? 'static/availability.json' : 'availability.json');
	const dir = readOption('--dir') ?? (DEV ? 'static/data/stock' : 'data/stock');
	const today = readOption('--today') ?? toISODateInTimeZone('Europe/Helsinki');

	const current = readAvailability(await readJson(availabilityPath));
	if (!current) {
		console.error(`❌ No availability data at ${availabilityPath}`);
		process.exit(1);
	}

	if (hasFlag('--demo')) {
		if (!path.resolve(dir).startsWith(path.resolve('static'))) {
			console.error('❌ --demo only writes under static/, never a deployed directory');
			process.exit(1);
		}
		await writeFiles(dir, demoState(current, today), current);
		return;
	}

	const stored = await readJson(path.join(dir, 'state.json'));
	const previous = readAvailability(await readJson(readOption('--previous')));
	if (stored && !isStockState(stored)) console.warn('⚠️  Unknown state.json format, starting over');
	if (!previous) console.warn('ℹ️  No previous availability; arrivals not checked');

	const state = updateStockState(isStockState(stored) ? stored : null, previous, current, today);
	await writeFiles(dir, state, current);
}

await main();

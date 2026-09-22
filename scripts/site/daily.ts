/**
 * Bakes the Alkometriikka Daily game for upcoming dates into pinned JSON files.
 *
 * The daily game must be identical for every visitor on a given day, and it
 * must be available the moment a new day starts (Finnish midnight). Generating
 * it client-side from the live `data.json` cannot guarantee either property:
 * `data.json` is re-synced every six hours, so two visitors (or the same
 * visitor at different times of day) can end up with different questions.
 *
 * This script runs at the end of each data sync and writes
 * `daily/<YYYY-MM-DD>.json` for today and the next {@link AHEAD_DAYS} days.
 * Files are never overwritten (same-version files keep the first baked game),
 * so the first sync to see a given date decides that date's questions forever.
 * Because every future date is already baked before it arrives, the game flips
 * over exactly at midnight — the client just fetches the file for the new date.
 *
 * The file is a *manifest*, not the game: the correct answers are never written
 * to disk. It ships a random seed, a frozen pool of the ~24 products that day's
 * questions draw from, and a SHA-256 hash of the canonical game. The client
 * rebuilds the exact game from the seed + pool and verifies it against the hash.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Kaljakori } from '../../src/lib/alko/index.ts';
import { DAILY_GAME_VERSION } from '../../src/lib/daily/questions';
import { generateDailyGameManifest, type DailyGameManifest } from '../../src/lib/daily/manifest';
import { toISODateInTimeZone } from '../../src/lib/utils/sales';

/** When running with `--dev` we operate on the local static folder. Mirrors the sync scripts. */
const DEV = process.argv.includes('--dev');

/** How many future dates (beyond today) to pre-bake every run. */
const AHEAD_DAYS = Number(process.env.DAILY_AHEAD_DAYS) || 2;
/** Dataset path written by the sync (see scripts/data/index.ts). */
const DATA_PATH = DEV ? './static/data.json' : './data.json';
/**
 * Directory the baked games are written to. In dev (`--dev`) they land in
 * `static/daily` so Vite serves them at `/daily/<date>.json` exactly like the
 * deployed site does; the sync pipeline bakes into `./daily` and deploys that
 * folder to the gh-pages site root.
 */
const DAILY_DIR = DEV ? './static/daily' : './daily';

type MigratedProduct = { values: unknown[] };

/** Mirrors the client `+layout.ts` loader so the baked games match exactly. */
function formatDatasetToJSON(data: string) {
	const { schema, products = {} } = JSON.parse(data);
	const header = [...schema, 'Hintahistoria', 'Poistunut valikoimasta'];
	const rows = Object.values(products as Record<string, MigratedProduct>)
		.filter((product) => product && typeof product === 'object' && Array.isArray(product.values))
		.map((product) => [...product.values, [], Boolean(false)]);
	return { table: [header, ...rows] };
}

function addDaysUTC(isoDate: string, days: number): string {
	const [year, month, day] = isoDate.split('-').map(Number);
	return toISODateInTimeZone('UTC', new Date(Date.UTC(year!, month! - 1, day! + days)));
}

function isCurrentVersion(path: string): boolean {
	try {
		const manifest = JSON.parse(readFileSync(path, 'utf8')) as DailyGameManifest;
		return manifest?.version === DAILY_GAME_VERSION;
	} catch {
		return false;
	}
}

async function bake(): Promise<void> {
	if (!existsSync(DATA_PATH)) {
		throw new Error(`Dataset not found at ${DATA_PATH}. Run the sync first.`);
	}

	const { table } = formatDatasetToJSON(await Bun.file(DATA_PATH).text());
	const catalog = new Kaljakori(table, { weight: null, gender: null }, { stores: {}, product: {} })
		.data;
	mkdirSync(DAILY_DIR, { recursive: true });

	const today = toISODateInTimeZone('Europe/Helsinki');
	const existing = new Set(readdirSync(DAILY_DIR));
	let written = 0;

	for (let offset = 0; offset <= AHEAD_DAYS; offset++) {
		const date = addDaysUTC(today, offset);
		const path = join(DAILY_DIR, `${date}.json`);
		if (existing.has(`${date}.json`) && isCurrentVersion(path)) {
			console.log(`⏭️  ${date} already baked (v${DAILY_GAME_VERSION})`);
			continue;
		}
		const manifest = await generateDailyGameManifest(date, catalog);
		writeFileSync(path, JSON.stringify(manifest));
		written++;
		console.log(
			`📅 Baked ${date} (pool: ${manifest.products.length}, ${manifest.gameHash.slice(0, 12)}…, v${DAILY_GAME_VERSION})`
		);
	}

	console.log(`✅ ${written} new daily manifest(s) written to ${DAILY_DIR}`);
}

await bake();

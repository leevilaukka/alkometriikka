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
 * Files are never overwritten (same-version files keep the first baked game;
 * CI must seed `daily/` from gh-pages before running this),
 * so the first sync to see a given date decides that date's questions forever.
 * Because every future date is already baked before it arrives, the game flips
 * over exactly at midnight — the client just fetches the file for the new date.
 *
 * The file is a *manifest*, not the game: the correct answers are never written
 * to disk. It ships a random seed, a frozen pool of the ~24 products that day's
 * questions draw from, and a SHA-256 hash of the canonical game. The client
 * rebuilds the exact game from the seed + pool and verifies it against the hash.
 *
 * Finished days are additionally archived to `daily/archive/<date>.json`: once a day
 * is over the answers are public anyway, so the archive stores the full resolved
 * game with embedded product display data (a self-contained record that keeps
 * replaying even after products leave the live catalog). Old manifests are kept
 * forever — they are tiny (~6 KB) and they are the only way to rebuild past days.
 */
import { existsSync } from 'node:fs';
import { Kaljakori } from '../../src/lib/alko/index.ts';
import { parseDataset } from '../../src/lib/utils/dataset.ts';
import { toISODateInTimeZone } from '../../src/lib/utils/sales';
import { bakeArchive, bakeManifests } from './daily-bake.ts';

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
/** Directory immutable archive records of finished days are written to. */
const ARCHIVE_DIR = DEV ? './static/daily/archive' : './daily/archive';

async function bake(): Promise<void> {
	if (!existsSync(DATA_PATH)) {
		throw new Error(`Dataset not found at ${DATA_PATH}. Run the sync first.`);
	}

	const { table } = parseDataset(await Bun.file(DATA_PATH).text());
	const catalog = new Kaljakori(table, { weight: null, gender: null }, { stores: {}, product: {} })
		.data;
	// Baking without the previously deployed manifests would re-roll dates that
	// players are already playing. CI must seed `daily/` from gh-pages first;
	// set DAILY_ALLOW_EMPTY=1 only to bootstrap a brand-new deployment.
	if (!DEV && !existsSync(DAILY_DIR) && !process.env.DAILY_ALLOW_EMPTY) {
		throw new Error(
			`${DAILY_DIR} not found. Seed it from the deployed site before baking (or set DAILY_ALLOW_EMPTY=1).`
		);
	}
	const today = toISODateInTimeZone('Europe/Helsinki');
	const written = await bakeManifests({
		dailyDir: DAILY_DIR,
		today,
		aheadDays: AHEAD_DAYS,
		catalog
	});

	console.log(`✅ ${written.length} new daily manifest(s) written to ${DAILY_DIR}`);
	await bakeArchive({
		dailyDir: DAILY_DIR,
		archiveDir: ARCHIVE_DIR,
		today,
		legacyDirs: DEV
			? ['./static/daily/arkisto', './static/daily/arkisto-data']
			: ['./daily/arkisto', './daily/arkisto-data']
	});
}

await bake();

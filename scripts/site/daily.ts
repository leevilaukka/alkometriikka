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
 *
 * Finished days are additionally archived to `daily/archive/<date>.json`: once a day
 * is over the answers are public anyway, so the archive stores the full resolved
 * game with embedded product display data (a self-contained record that keeps
 * replaying even after products leave the live catalog). Old manifests are kept
 * forever — they are tiny (~6 KB) and they are the only way to rebuild past days.
 */
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync
} from 'node:fs';
import { join } from 'node:path';
import { Kaljakori } from '../../src/lib/alko/index.ts';
import { DAILY_GAME_VERSION } from '../../src/lib/daily/questions';
import {
	ARCHIVE_INDEX_VERSION,
	buildArchiveGame,
	generateDailyGameManifest,
	type DailyGameManifest
} from '../../src/lib/daily/manifest';
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
/** Directory immutable archive records of finished days are written to. */
const ARCHIVE_DIR = DEV ? './static/daily/archive' : './daily/archive';

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

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ARCHIVE_DIR_NAME = ARCHIVE_DIR.split('/').pop();

/**
 * Archives finished days (any manifest date before today) that are not archived
 * yet. Once written, an archive file is immutable — it must never be rewritten,
 * because it pins the exact game to its date; later format/generator changes
 * must not touch history. Re-runs only fill in missing dates and refresh the
 * index of available archives.
 */
async function bakeArchive(today: string): Promise<void> {
	mkdirSync(ARCHIVE_DIR, { recursive: true });

	const legacyDirs = DEV
		? ['./static/daily/arkisto', './static/daily/arkisto-data']
		: ['./daily/arkisto', './daily/arkisto-data'];
	for (const legacyDir of legacyDirs) {
		if (existsSync(legacyDir)) {
			try {
				for (const file of readdirSync(legacyDir)) {
					const src = join(legacyDir, file);
					const dest = join(ARCHIVE_DIR, file);
					if (!existsSync(dest)) {
						copyFileSync(src, dest);
					}
				}
				rmSync(legacyDir, { recursive: true, force: true });
			} catch {}
		}
	}

	const existing = readdirSync(DAILY_DIR)
		.filter((file) => file.endsWith('.json'))
		.map((file) => file.slice(0, 10))
		.filter((date) => ISO_DATE.test(date) && date < today);
	const current = new Set(
		readdirSync(ARCHIVE_DIR)
			.filter((file) => file.endsWith('.json'))
			.map((file) => file.slice(0, 10))
	);
	let archived = 0;

	for (const date of existing) {
		if (current.has(date)) continue;
		const manifestPath = join(DAILY_DIR, `${date}.json`);
		let manifest: DailyGameManifest;
		try {
			manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as DailyGameManifest;
		} catch {
			continue;
		}
		if (manifest?.version !== DAILY_GAME_VERSION || manifest.date !== date) continue;
		const archive = await buildArchiveGame(manifest);
		if (!archive) continue;
		writeFileSync(join(ARCHIVE_DIR, `${date}.json`), JSON.stringify(archive));
		archived++;
		console.log(`🗄️  Archived ${date} (${archive.game.questions.length} questions)`);
	}

	const index = {
		version: ARCHIVE_INDEX_VERSION,
		dates: readdirSync(ARCHIVE_DIR)
			.filter((file) => file.endsWith('.json') && file !== 'index.json')
			.map((file) => file.slice(0, 10))
			.filter((date) => ISO_DATE.test(date))
			.sort((a, b) => b.localeCompare(a))
	};
	writeFileSync(join(ARCHIVE_DIR, 'index.json'), JSON.stringify(index));
	console.log(
		`📋 Archive index: ${index.dates.length} day(s) available (${archived} newly archived in ${ARCHIVE_DIR_NAME}/)`
	);
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
	await bakeArchive(today);
}

await bake();

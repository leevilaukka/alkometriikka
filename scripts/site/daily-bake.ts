/**
 * Bake logic for the Daily game (see daily.ts for the pipeline overview).
 * Paths and dates are parameters so the whole bake → archive lifecycle can be
 * tested against a temp directory.
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
import type { PriceListItem } from '../../src/lib/types.ts';
import { DAILY_GAME_VERSION } from '../../src/lib/daily/questions';
import {
	ARCHIVE_INDEX_VERSION,
	buildArchiveGame,
	generateDailyGameManifest,
	type DailyGameManifest
} from '../../src/lib/daily/manifest';
import { toISODateInTimeZone } from '../../src/lib/utils/sales';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function addDaysUTC(isoDate: string, days: number): string {
	const [year, month, day] = isoDate.split('-').map(Number);
	return toISODateInTimeZone('UTC', new Date(Date.UTC(year!, month! - 1, day! + days)));
}

export function isCurrentVersion(path: string): boolean {
	try {
		const manifest = JSON.parse(readFileSync(path, 'utf8')) as DailyGameManifest;
		return manifest?.version === DAILY_GAME_VERSION;
	} catch {
		return false;
	}
}

/**
 * Writes `<dailyDir>/<date>.json` for `today` and the next `aheadDays` days.
 * A date that already has a current-version manifest is never rebaked: the
 * first sync to see a date decides its questions forever. Returns the dates
 * written.
 */
export async function bakeManifests(options: {
	dailyDir: string;
	today: string;
	aheadDays: number;
	catalog: readonly PriceListItem[];
	log?: (message: string) => void;
}): Promise<string[]> {
	const { dailyDir, today, aheadDays, catalog, log = console.log } = options;
	mkdirSync(dailyDir, { recursive: true });
	const existing = new Set(readdirSync(dailyDir));
	const written: string[] = [];

	for (let offset = 0; offset <= aheadDays; offset++) {
		const date = addDaysUTC(today, offset);
		const path = join(dailyDir, `${date}.json`);
		if (existing.has(`${date}.json`) && isCurrentVersion(path)) {
			log(`⏭️  ${date} already baked (v${DAILY_GAME_VERSION})`);
			continue;
		}
		const manifest = await generateDailyGameManifest(date, catalog);
		writeFileSync(path, JSON.stringify(manifest));
		written.push(date);
		log(
			`📅 Baked ${date} (pool: ${manifest.products.length}, ${manifest.gameHash.slice(0, 12)}…, v${DAILY_GAME_VERSION})`
		);
	}
	return written;
}

/**
 * Archives finished days (any manifest date before today) that are not archived
 * yet. Once written, an archive file is immutable — it must never be rewritten,
 * because it pins the exact game to its date; later format/generator changes
 * must not touch history. Re-runs only fill in missing dates and refresh the
 * index of available archives. Returns the newly archived dates.
 */
export async function bakeArchive(options: {
	dailyDir: string;
	archiveDir: string;
	today: string;
	/** Old archive folders whose files are moved into `archiveDir` and then removed. */
	legacyDirs?: string[];
	log?: (message: string) => void;
}): Promise<string[]> {
	const { dailyDir, archiveDir, today, legacyDirs = [], log = console.log } = options;
	mkdirSync(archiveDir, { recursive: true });

	for (const legacyDir of legacyDirs) {
		if (existsSync(legacyDir)) {
			try {
				for (const file of readdirSync(legacyDir)) {
					const src = join(legacyDir, file);
					const dest = join(archiveDir, file);
					if (!existsSync(dest)) {
						copyFileSync(src, dest);
					}
				}
				rmSync(legacyDir, { recursive: true, force: true });
			} catch {}
		}
	}

	const existing = readdirSync(dailyDir)
		.filter((file) => file.endsWith('.json'))
		.map((file) => file.slice(0, 10))
		.filter((date) => ISO_DATE.test(date) && date < today);
	const current = new Set(
		readdirSync(archiveDir)
			.filter((file) => file.endsWith('.json'))
			.map((file) => file.slice(0, 10))
	);
	const archived: string[] = [];

	for (const date of existing) {
		if (current.has(date)) continue;
		const manifestPath = join(dailyDir, `${date}.json`);
		let manifest: DailyGameManifest;
		try {
			manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as DailyGameManifest;
		} catch {
			continue;
		}
		if (manifest?.version !== DAILY_GAME_VERSION || manifest.date !== date) continue;
		const archive = await buildArchiveGame(manifest);
		if (!archive) continue;
		writeFileSync(join(archiveDir, `${date}.json`), JSON.stringify(archive));
		archived.push(date);
		log(`🗄️  Archived ${date} (${archive.game.questions.length} questions)`);
	}

	const index = {
		version: ARCHIVE_INDEX_VERSION,
		dates: readdirSync(archiveDir)
			.filter((file) => file.endsWith('.json') && file !== 'index.json')
			.map((file) => file.slice(0, 10))
			.filter((date) => ISO_DATE.test(date))
			.sort((a, b) => b.localeCompare(a))
	};
	writeFileSync(join(archiveDir, 'index.json'), JSON.stringify(index));
	log(
		`📋 Archive index: ${index.dates.length} day(s) available (${archived.length} newly archived in ${archiveDir.split('/').pop()}/)`
	);
	return archived;
}

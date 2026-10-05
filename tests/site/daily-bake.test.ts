import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AllColumns } from '$lib/utils/constants';
import type { PriceListItem } from '$lib/types';
import { DAILY_GAME_VERSION } from '$lib/daily/questions';
import type { ArchiveGame, ArchiveIndex, DailyGameManifest } from '$lib/daily/manifest';
import {
	addDaysUTC,
	bakeArchive,
	bakeManifests,
	isCurrentVersion
} from '../../scripts/site/daily-bake';

const product = (id: string, price: number, volume = 0.7, alcohol = 12) =>
	({
		[AllColumns.Number]: id,
		[AllColumns.Name]: `Product ${id}`,
		[AllColumns.Price]: price,
		[AllColumns.BottleSize]: volume,
		[AllColumns.PricePerLiter]: price / volume,
		[AllColumns.AlcoholPercentage]: alcohol,
		[AllColumns.Manufacturer]: `Maker ${id}`,
		[AllColumns.Country]: `Country ${id}`,
		[AllColumns.Type]: `Type ${id}`,
		[AllColumns.Sugar]: Number(id),
		[AllColumns.Energy]: 100 + Number(id),
		[AllColumns.NormalPrice]: price + 2,
		[AllColumns.AlcoholGramsPerEuro]: (volume * alcohol * 10) / price,
		[AllColumns.History]: []
	}) as unknown as PriceListItem;

const catalog = [
	product('1', 8),
	product('2', 12, 0.5, 5),
	product('3', 18, 0.75, 40),
	product('4', 25, 0.7, 13),
	product('5', 32, 0.75, 14)
];

let root: string;
let dailyDir: string;
let archiveDir: string;
const quiet = () => {};
const readJson = <T>(path: string) => JSON.parse(readFileSync(path, 'utf8')) as T;
const names = (dir: string) => readdirSync(dir).sort();

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), 'alko-bake-'));
	dailyDir = join(root, 'daily');
	archiveDir = join(dailyDir, 'archive');
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('addDaysUTC', () => {
	it('crosses month, year and leap-day boundaries', () => {
		expect(addDaysUTC('2026-09-30', 1)).toBe('2026-10-01');
		expect(addDaysUTC('2026-12-31', 1)).toBe('2027-01-01');
		expect(addDaysUTC('2028-02-28', 1)).toBe('2028-02-29');
		expect(addDaysUTC('2026-10-01', -1)).toBe('2026-09-30');
		expect(addDaysUTC('2026-10-01', 0)).toBe('2026-10-01');
	});
});

describe('bakeManifests', () => {
	it('bakes today plus the look-ahead days', async () => {
		const written = await bakeManifests({
			dailyDir,
			today: '2026-10-01',
			aheadDays: 2,
			catalog,
			log: quiet
		});
		expect(written).toEqual(['2026-10-01', '2026-10-02', '2026-10-03']);
		expect(names(dailyDir)).toEqual(['2026-10-01.json', '2026-10-02.json', '2026-10-03.json']);
		const manifest = readJson<DailyGameManifest>(join(dailyDir, '2026-10-02.json'));
		expect(manifest).toMatchObject({ date: '2026-10-02', version: DAILY_GAME_VERSION });
		expect(JSON.stringify(manifest)).not.toContain('correct');
	});

	it('never rewrites an existing current-version manifest, only fills in new dates', async () => {
		await bakeManifests({ dailyDir, today: '2026-10-01', aheadDays: 1, catalog, log: quiet });
		const before = readFileSync(join(dailyDir, '2026-10-01.json'), 'utf8');

		const written = await bakeManifests({
			dailyDir,
			today: '2026-10-02',
			aheadDays: 1,
			catalog,
			log: quiet
		});
		expect(written).toEqual(['2026-10-03']);
		expect(readFileSync(join(dailyDir, '2026-10-01.json'), 'utf8')).toBe(before);
	});

	it('rebakes a manifest from an older game version or a corrupt file', async () => {
		mkdirSync(dailyDir, { recursive: true });
		writeFileSync(
			join(dailyDir, '2026-10-01.json'),
			JSON.stringify({ version: DAILY_GAME_VERSION - 1 })
		);
		writeFileSync(join(dailyDir, '2026-10-02.json'), '{not json');

		const written = await bakeManifests({
			dailyDir,
			today: '2026-10-01',
			aheadDays: 1,
			catalog,
			log: quiet
		});
		expect(written).toEqual(['2026-10-01', '2026-10-02']);
		expect(isCurrentVersion(join(dailyDir, '2026-10-01.json'))).toBe(true);
		expect(isCurrentVersion(join(dailyDir, '2026-10-02.json'))).toBe(true);
	});

	it('refuses to bake from an empty catalog', async () => {
		expect(
			bakeManifests({ dailyDir, today: '2026-10-01', aheadDays: 0, catalog: [], log: quiet })
		).rejects.toThrow('No valid products');
	});
});

describe('isCurrentVersion', () => {
	it('is false for missing files', () => {
		expect(isCurrentVersion(join(root, 'nope.json'))).toBe(false);
	});
});

describe('bakeArchive', () => {
	it('archives only finished days and writes a newest-first index', async () => {
		await bakeManifests({ dailyDir, today: '2026-09-30', aheadDays: 3, catalog, log: quiet });
		const archived = await bakeArchive({ dailyDir, archiveDir, today: '2026-10-02', log: quiet });

		expect(archived.sort()).toEqual(['2026-09-30', '2026-10-01']);
		expect(names(archiveDir)).toEqual(['2026-09-30.json', '2026-10-01.json', 'index.json']);
		expect(readJson<ArchiveIndex>(join(archiveDir, 'index.json'))).toEqual({
			version: 1,
			dates: ['2026-10-01', '2026-09-30']
		});
		const day = readJson<ArchiveGame>(join(archiveDir, '2026-09-30.json'));
		expect(day.game.questions.length).toBeGreaterThan(0);
		// Unlike the manifest, the archive carries the resolved answers.
		expect(JSON.stringify(day.game)).toContain('correct');
	});

	it('keeps archive files immutable on later runs', async () => {
		await bakeManifests({ dailyDir, today: '2026-09-30', aheadDays: 0, catalog, log: quiet });
		await bakeArchive({ dailyDir, archiveDir, today: '2026-10-01', log: quiet });
		const path = join(archiveDir, '2026-09-30.json');
		writeFileSync(path, '{"pinned":true}');

		const archived = await bakeArchive({ dailyDir, archiveDir, today: '2026-10-02', log: quiet });
		expect(archived).toEqual([]);
		expect(readFileSync(path, 'utf8')).toBe('{"pinned":true}');
	});

	it('skips manifests of another version, with a mismatched date, or that are corrupt', async () => {
		mkdirSync(dailyDir, { recursive: true });
		const good = await (async () => {
			await bakeManifests({ dailyDir, today: '2026-09-28', aheadDays: 0, catalog, log: quiet });
			return readJson<DailyGameManifest>(join(dailyDir, '2026-09-28.json'));
		})();
		writeFileSync(
			join(dailyDir, '2026-09-27.json'),
			JSON.stringify({ ...good, date: '2026-09-27', version: 1 })
		);
		writeFileSync(
			join(dailyDir, '2026-09-26.json'),
			JSON.stringify({ ...good, date: '2026-01-01' })
		);
		writeFileSync(join(dailyDir, '2026-09-25.json'), 'garbage');
		writeFileSync(
			join(dailyDir, '2026-09-24.json'),
			JSON.stringify({ ...good, date: '2026-09-24', gameHash: 'f'.repeat(64) })
		);
		writeFileSync(join(dailyDir, 'notes.json'), '{}');

		const archived = await bakeArchive({ dailyDir, archiveDir, today: '2026-10-01', log: quiet });
		expect(archived).toEqual(['2026-09-28']);
	});

	it('migrates legacy archive folders without overwriting and removes them', async () => {
		await bakeManifests({ dailyDir, today: '2026-10-01', aheadDays: 0, catalog, log: quiet });
		const legacy = join(dailyDir, 'arkisto');
		mkdirSync(legacy, { recursive: true });
		mkdirSync(archiveDir, { recursive: true });
		writeFileSync(join(legacy, '2026-08-01.json'), '{"legacy":true}');
		writeFileSync(join(legacy, '2026-08-02.json'), '{"legacy":true}');
		writeFileSync(join(archiveDir, '2026-08-02.json'), '{"current":true}');

		await bakeArchive({
			dailyDir,
			archiveDir,
			today: '2026-10-01',
			legacyDirs: [legacy],
			log: quiet
		});

		expect(existsSync(legacy)).toBe(false);
		expect(readFileSync(join(archiveDir, '2026-08-01.json'), 'utf8')).toBe('{"legacy":true}');
		expect(readFileSync(join(archiveDir, '2026-08-02.json'), 'utf8')).toBe('{"current":true}');
		expect(readJson<ArchiveIndex>(join(archiveDir, 'index.json')).dates).toEqual([
			'2026-08-02',
			'2026-08-01'
		]);
	});

	it('writes an empty index when nothing is finished yet', async () => {
		await bakeManifests({ dailyDir, today: '2026-10-01', aheadDays: 1, catalog, log: quiet });
		const archived = await bakeArchive({ dailyDir, archiveDir, today: '2026-10-01', log: quiet });
		expect(archived).toEqual([]);
		expect(readJson<ArchiveIndex>(join(archiveDir, 'index.json'))).toEqual({
			version: 1,
			dates: []
		});
	});
});

describe('bake lifecycle across days', () => {
	it('bakes ahead, rolls over at midnight and archives yesterday exactly once', async () => {
		const opts = { dailyDir, archiveDir, log: quiet };
		// Day 1: today + 2 ahead are baked, nothing is finished.
		await bakeManifests({ ...opts, today: '2026-10-01', aheadDays: 2, catalog });
		await bakeArchive({ ...opts, today: '2026-10-01' });
		const day3Before = readFileSync(join(dailyDir, '2026-10-03.json'), 'utf8');

		// Day 2: only the new far-future date is baked, day 1 is archived.
		expect(await bakeManifests({ ...opts, today: '2026-10-02', aheadDays: 2, catalog })).toEqual([
			'2026-10-04'
		]);
		expect(await bakeArchive({ ...opts, today: '2026-10-02' })).toEqual(['2026-10-01']);
		expect(readFileSync(join(dailyDir, '2026-10-03.json'), 'utf8')).toBe(day3Before);

		// Day 3: day 2 joins the archive; day 1 is untouched.
		expect(await bakeArchive({ ...opts, today: '2026-10-03' })).toEqual(['2026-10-02']);
		expect(readJson<ArchiveIndex>(join(archiveDir, 'index.json')).dates).toEqual([
			'2026-10-02',
			'2026-10-01'
		]);
	});
});

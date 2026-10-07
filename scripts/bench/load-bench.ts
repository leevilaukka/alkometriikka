/**
 * Load-time benchmark for the client-side data pipeline: parsing `data.json`,
 * building the `Kaljakori` index and the first search/filter pass.
 *
 * Usage:
 *   bun run scripts/bench/load-bench.ts                       # synthetic dataset
 *   bun run scripts/bench/load-bench.ts --data static/data.json --availability static/availability.json
 *   bun run scripts/bench/load-bench.ts --products 13000 --stores 360 --runs 7
 *
 * Numbers are medians over `--runs` runs (after one warm-up). Desktop Bun is
 * several times faster than a mid-range phone, so treat them as relative.
 */
import { parseArgs } from 'node:util';
import { Kaljakori } from '$lib/alko';
import { parseDataset } from '$lib/utils/dataset';
import { parseAvailability } from '$lib/utils/availability';
import { AllColumns, DatasetColumns } from '$lib/utils/constants';
import type { AvailabilityData, DatasetRow } from '$lib/types';

const { values: args } = parseArgs({
	options: {
		data: { type: 'string' },
		availability: { type: 'string' },
		products: { type: 'string', default: '13000' },
		stores: { type: 'string', default: '360' },
		runs: { type: 'string', default: '5' },
		// Adds the precomputed filter index to a dataset that lacks one (real
		// data.json from before the sync wrote it), to measure the fast path.
		'with-index': { type: 'boolean', default: false }
	}
});

const runs = Math.max(1, Number(args.runs));

// --- Synthetic data ---------------------------------------------------------

/** Small deterministic PRNG so runs are comparable. */
function rng(seed: number) {
	return () => {
		seed = (seed * 1664525 + 1013904223) >>> 0;
		return seed / 2 ** 32;
	};
}

function syntheticData(productCount: number, storeCount: number) {
	const random = rng(42);
	const pick = <T>(list: readonly T[]) => list[Math.floor(random() * list.length)];
	const types = [
		'oluet',
		'punaviinit',
		'valkoviinit',
		'väkevät',
		'siiderit',
		'kuohuviinit',
		'roseeviinit',
		'juomasekoitukset'
	];
	const subTypes = [
		'lager',
		'ipa',
		'stout',
		'mehevä & hilloinen',
		'pehmeä & kypsä',
		'viskit',
		'rommit',
		'kuiva',
		'puolikuiva',
		''
	];
	const beerTypes = ['pale lager', 'vahva lager', 'ale', '', ''];
	const countries = [
		'Suomi',
		'Ranska',
		'Italia',
		'Espanja',
		'Saksa',
		'Chile',
		'Australia',
		'Belgia',
		'Skotlanti',
		'Yhdysvallat'
	];
	const regions = ['Bordeaux', 'Toscana', 'Rioja', 'Mosel', 'Napa Valley', '', ''];
	const words = [
		'raikas',
		'humalainen',
		'maltainen',
		'hedelmäinen',
		'tamminen',
		'mausteinen',
		'kevyt',
		'täyteläinen',
		'makea',
		'kuiva',
		'mineraalinen',
		'savuinen',
		'kirsikkainen',
		'vaniljainen'
	];
	const grapes = [
		'Cabernet Sauvignon',
		'Merlot',
		'Chardonnay',
		'Riesling',
		'Pinot Noir',
		'Syrah',
		'Tempranillo',
		'Sangiovese'
	];
	const packaging = ['pullo', 'tölkki', 'hanapakkaus', 'kartonkitölkki', 'muovipullo'];
	const sizes = [0.33, 0.375, 0.5, 0.568, 0.7, 0.75, 1, 1.5, 3];
	const nameParts = [
		'Lapin',
		'Kulta',
		'Karhu',
		'Château',
		'Domaine',
		'Reserva',
		'Gran',
		'Premium',
		'Export',
		'Hill',
		'Valley',
		'Estate',
		'Old',
		'Single',
		'Malt',
		'Brut',
		'Rosé',
		'Classic'
	];
	const manufacturers = Array.from({ length: 900 }, (_, i) => `Valmistaja ${i}`);
	const header = Object.values(DatasetColumns).filter(
		(column) => column !== DatasetColumns.History && column !== DatasetColumns.RemovedFromSelection
	);
	const col = (name: string) => header.indexOf(name as never);

	const products: Record<string, unknown> = {};
	for (let i = 0; i < productCount; i++) {
		const id = String(100000 + i);
		const values: unknown[] = Array(header.length).fill(null);
		const size = pick(sizes);
		const price = Math.round((2 + random() * 80) * 100) / 100;
		const type = pick(types);
		values[col(DatasetColumns.Number)] = id;
		values[col(DatasetColumns.Name)] =
			`${pick(nameParts)} ${pick(nameParts)} ${pick(nameParts)} ${i}`;
		values[col(DatasetColumns.Manufacturer)] = pick(manufacturers);
		values[col(DatasetColumns.BottleSize)] = size;
		values[col(DatasetColumns.Price)] = price;
		values[col(DatasetColumns.PricePerLiter)] = Math.round((price / size) * 100) / 100;
		values[col(DatasetColumns.New)] = random() < 0.05 ? 'uutuus' : null;
		values[col(DatasetColumns.Type)] = type;
		values[col(DatasetColumns.SubType)] = pick(subTypes);
		values[col(DatasetColumns.BeerType)] = type === 'oluet' ? pick(beerTypes) : null;
		values[col(DatasetColumns.Country)] = pick(countries);
		values[col(DatasetColumns.Region)] = pick(regions);
		values[col(DatasetColumns.Vintage)] = random() < 0.3 ? 2015 + Math.floor(random() * 10) : null;
		values[col(DatasetColumns.GrapeVarieties)] =
			random() < 0.4 ? `${pick(grapes)}, ${pick(grapes)}` : '';
		values[col(DatasetColumns.Description)] = Array.from(
			{ length: 2 + Math.floor(random() * 5) },
			() => ` ${pick(words)}`
		);
		values[col(DatasetColumns.PackagingType)] = pick(packaging);
		values[col(DatasetColumns.SealingType)] = 'kierrekorkki';
		values[col(DatasetColumns.AlcoholPercentage)] = Math.round(random() * 450) / 10;
		values[col(DatasetColumns.Sugar)] = Math.floor(random() * 50);
		values[col(DatasetColumns.Energy)] = 40 + Math.floor(random() * 250);
		values[col(DatasetColumns.Availability)] =
			random() < 0.02 ? 'tarvikevalikoima' : 'vakiovalikoima';
		values[col(DatasetColumns.EAN)] = String(6400000000000 + i);
		if (random() < 0.08) {
			values[col(DatasetColumns.NormalPrice)] = Math.round(price * 1.2 * 100) / 100;
			values[col(DatasetColumns.CampaignStart)] = '2026-01-01';
			values[col(DatasetColumns.CampaignEnd)] = '2099-01-01';
		}
		const priceHistory = Array.from({ length: 1 + Math.floor(random() * 4) }, (_, k) => ({
			date: `2026-0${k + 1}-15`,
			price: Math.round(price * (0.9 + random() * 0.2) * 100) / 100
		}));
		products[id] = {
			hash: 'x'.repeat(64),
			values,
			priceHistory,
			...(random() < 0.1 ? { meta: { removedFromSelection: '2026-05-01' } } : {})
		};
	}

	const stores: Record<string, unknown> = {};
	for (let s = 0; s < storeCount; s++) {
		const id = String(2000 + s);
		stores[id] = { id, name: `Myymälä ${s}`, outletType: '1', city: 'Kaupunki' };
	}
	const storeIds = Object.keys(stores);
	const availabilityProducts: Record<string, string[]> = {};
	for (const id of Object.keys(products)) {
		// Real data averages ~45 stores per product, skewed towards a few products in every store
		const count = Math.floor(random() ** 2 * storeCount * 0.4);
		const ids = new Set<string>();
		while (ids.size < count) ids.add(pick(storeIds));
		availabilityProducts[id] = [...ids];
	}

	return {
		data: { schema: header, metadata: { LastUpdated: '2026-10-01T00:00:00.000Z' }, products },
		availability: { lastUpdated: '2026-10-01T00:00:00.000Z', stores, product: availabilityProducts }
	};
}

// --- Harness -----------------------------------------------------------------

async function loadText(): Promise<{ data: string; availability: string; source: string }> {
	if (args.data) {
		const data = await Bun.file(args.data).text();
		const availability = args.availability ? await Bun.file(args.availability).text() : '{}';
		return { data, availability, source: args.data };
	}
	const synthetic = syntheticData(Number(args.products), Number(args.stores));
	return {
		data: JSON.stringify(synthetic.data),
		availability: JSON.stringify(synthetic.availability),
		source: `synthetic (${args.products} products, ${args.stores} stores)`
	};
}

function median(values: number[]) {
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.floor(sorted.length / 2)];
}

const results: [string, number][] = [];
function time<T>(label: string, fn: () => T): T {
	let result!: T;
	fn(); // warm-up
	const samples: number[] = [];
	for (let i = 0; i < runs; i++) {
		Bun.gc(true);
		const start = performance.now();
		result = fn();
		samples.push(performance.now() - start);
	}
	results.push([label, median(samples)]);
	return result;
}

let { data: dataText, availability: availabilityText, source } = await loadText();
if (args['with-index']) {
	const parsed = JSON.parse(dataText);
	const { buildDatasetIndex } = await import('../data/dataset-index');
	parsed.index = buildDatasetIndex(parsed);
	dataText = JSON.stringify(parsed);
}

// Kaljakori logs skipped products in some versions; keep the output readable.
const log = console.log;
console.log = () => {};

time('JSON.parse(data.json)', () => JSON.parse(dataText));
time('parseDataset', () => parseDataset(dataText));
const availability = time('parseAvailability', () =>
	parseAvailability(JSON.parse(availabilityText))
);
time('new Kaljakori (no availability)', () => {
	const { table, index } = parseDataset(dataText);
	return new Kaljakori(table as DatasetRow[], undefined, undefined, index);
});
const parsedOnly = median(
	Array.from({ length: runs }, () => {
		const start = performance.now();
		parseDataset(dataText);
		return performance.now() - start;
	})
);
results.push(['  ↳ minus parseDataset', results.at(-1)![1] - parsedOnly]);
const kaljakori = time('new Kaljakori (with availability)', () => {
	const { table, index } = parseDataset(dataText);
	return new Kaljakori(table as DatasetRow[], undefined, availability as AvailabilityData, index);
});
results.push(['  ↳ minus parseDataset', results.at(-1)![1] - parsedOnly]);
// Filter values, types and ranges are built on first use in newer versions
{
	const build = () => {
		const { table, index } = parseDataset(dataText);
		return new Kaljakori(table as DatasetRow[], undefined, availability as AvailabilityData, index);
	};
	const samples = Array.from({ length: runs + 1 }, () => {
		const instance = build();
		Bun.gc(true);
		const start = performance.now();
		instance.getFilterValues(AllColumns.Type);
		instance.getMinAndMaxValues(AllColumns.Price);
		return performance.now() - start;
	});
	results.push(['first filter access (value index)', median(samples.slice(1))]);
}
if ('setAvailability' in kaljakori) {
	time('kaljakori.setAvailability', () => (kaljakori as any).setAvailability(availability));
}

time('fuzzySearchAndFilter("", {})', () => kaljakori.fuzzySearchAndFilter('', {}));
time('fuzzySearchAndFilter("lapin", {})', () => kaljakori.fuzzySearchAndFilter('lapin', {}));
time('fuzzySearchAndFilter("kulta lapn", {})', () =>
	kaljakori.fuzzySearchAndFilter('kulta lapn', {})
);
time('fuzzySearchAndFilter("", type + price)', () =>
	kaljakori.fuzzySearchAndFilter('', {
		[AllColumns.Type]: new Set(kaljakori.getFilterValues(AllColumns.Type).slice(0, 2)),
		[AllColumns.Price]: [5, 30]
	})
);

console.log = log;
console.log(
	`\nSource: ${source}  (${(dataText.length / 1e6).toFixed(1)} MB data, ${(availabilityText.length / 1e6).toFixed(1)} MB availability)`
);
console.log(`Products in index: ${kaljakori.data.length}, median of ${runs} runs\n`);
const width = Math.max(...results.map(([label]) => label.length));
for (const [label, ms] of results)
	console.log(`${label.padEnd(width)}  ${ms.toFixed(1).padStart(8)} ms`);

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { formatDatasetToJSON, parseAvailability } from '../../src/lib/alko/dataset.ts';
import { Catalog, type DatasetStatus } from '../catalog.ts';

export const FIXTURE_DIR = join(import.meta.dir, 'fixtures');
export const fixtureText = (name: 'data.json' | 'availability.json') =>
	readFileSync(join(FIXTURE_DIR, name), 'utf8');

/** Runs `fn` with console.log silenced (`Kaljakori` logs the whole dataset). */
export function quietly<T>(fn: () => T): T {
	const log = console.log;
	const restore = () => {
		console.log = log;
	};
	console.log = () => {};
	try {
		const result = fn();
		if (result instanceof Promise) return result.finally(restore) as T;
		restore();
		return result;
	} catch (error) {
		restore();
		throw error;
	}
}

export const fixtureStatus: DatasetStatus = {
	last_updated: '2026-09-20T10:00:00.000Z',
	last_synced: '2026-09-20T12:00:00.000Z',
	availability_last_updated: '2026-09-20T12:00:00.000Z',
	downloaded_at: '2026-09-20T12:05:00.000Z',
	source: 'fixture',
	stale: false
};

export function fixtureCatalog(
	options: { withAvailability?: boolean; siteUrl?: string } = {}
): Catalog {
	const { table } = formatDatasetToJSON(fixtureText('data.json'));
	const availability =
		options.withAvailability === false
			? { stores: {}, product: {} }
			: parseAvailability(JSON.parse(fixtureText('availability.json')));
	return quietly(() => new Catalog(table, availability, fixtureStatus, options.siteUrl));
}

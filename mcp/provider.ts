/**
 * Keeps an up-to-date `Catalog` in memory, backed by the cached data files.
 *
 * The catalog is rebuilt only when a file's content actually changed; every
 * call otherwise reuses the parsed catalog. Availability is optional, as in the
 * web app: if it cannot be loaded, the catalog is served without it.
 */
import { readFile } from 'node:fs/promises';
import { formatDatasetToJSON, parseAvailability } from '../src/lib/alko/dataset.ts';
import type { AvailabilityData } from '../src/lib/types.ts';
import { Catalog, type DatasetStatus } from './catalog.ts';
import { CachedResource, type DataStoreOptions, type ResourceState } from './data-store.ts';

export class CatalogProvider {
	private readonly data: CachedResource;
	private readonly availability: CachedResource;
	private catalog: Catalog | null = null;
	private version = '';
	private pending: Promise<Catalog> | null = null;

	constructor(private readonly options: DataStoreOptions) {
		this.data = new CachedResource('data.json', options, (text) => {
			formatDatasetToJSON(text);
		});
		this.availability = new CachedResource('availability.json', options, (text) => {
			parseAvailability(JSON.parse(text));
		});
	}

	/** Returns the current catalog, refreshing the underlying files when they are due. */
	get(): Promise<Catalog> {
		this.pending ??= this.refresh().finally(() => {
			this.pending = null;
		});
		return this.pending;
	}

	private async refresh(): Promise<Catalog> {
		const warnings: string[] = [];

		let data: ResourceState;
		try {
			data = await this.data.load();
		} catch (error) {
			// Keep answering from memory if the files became unavailable mid-session.
			if (!this.catalog) throw error;
			this.catalog.status = {
				...this.catalog.status,
				stale: true,
				warnings: [error instanceof Error ? error.message : String(error)]
			};
			return this.catalog;
		}
		if (data.warning) warnings.push(data.warning);

		let availabilityState: ResourceState | null = null;
		try {
			availabilityState = await this.availability.load();
			if (availabilityState.warning) warnings.push(availabilityState.warning);
		} catch (error) {
			warnings.push(
				`Store availability is unavailable: ${error instanceof Error ? error.message : String(error)}`
			);
		}

		const stale = data.stale || Boolean(availabilityState?.stale);
		const version = `${data.version}|${availabilityState?.version ?? 'none'}`;
		let availability = this.catalog?.availability;
		if (!this.catalog || version !== this.version) {
			const { table, metadata } = formatDatasetToJSON(await readFile(data.path, 'utf8'));
			availability = await this.readAvailability(availabilityState, warnings);
			this.catalog = new Catalog(
				table,
				availability,
				this.status(metadata, data, availability, stale, warnings),
				this.options.baseUrl
			);
			this.version = version;
		} else {
			const { last_updated, last_synced } = this.catalog.status;
			this.catalog.status = this.status(
				{ LastUpdated: last_updated ?? undefined, LastSynced: last_synced ?? undefined },
				data,
				availability!,
				stale,
				warnings
			);
		}
		return this.catalog;
	}

	private async readAvailability(
		state: ResourceState | null,
		warnings: string[]
	): Promise<AvailabilityData> {
		if (state) {
			try {
				return parseAvailability(JSON.parse(await readFile(state.path, 'utf8')));
			} catch (error) {
				warnings.push(
					`Store availability could not be parsed: ${error instanceof Error ? error.message : String(error)}`
				);
			}
		}
		return { stores: {}, product: {} };
	}

	private status(
		metadata: { LastUpdated?: string; LastSynced?: string },
		data: ResourceState,
		availability: AvailabilityData,
		stale: boolean,
		warnings: string[]
	): DatasetStatus {
		return {
			last_updated: metadata.LastUpdated ?? null,
			last_synced: metadata.LastSynced ?? null,
			availability_last_updated: availability.lastUpdated ?? null,
			downloaded_at: data.validatedAt ?? null,
			source: this.options.localDir ?? this.options.baseUrl,
			stale,
			...(warnings.length ? { warnings } : {})
		};
	}
}

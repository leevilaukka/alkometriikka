/**
 * Downloads and caches Alkometriikka's public data files (`data.json`,
 * `availability.json`) for the MCP server.
 *
 * Behaviour, per file:
 * - A cached copy younger than `ttlMs` is used as-is, without any network request.
 * - Older copies are revalidated with a conditional GET (`If-None-Match` /
 *   `If-Modified-Since`), so an unchanged file costs a `304` and no body.
 * - Downloaded content is validated before it replaces the cache, and written
 *   atomically, so a truncated or malformed response never corrupts the cache.
 * - On network/HTTP failure the stale cached copy keeps being served (flagged
 *   as stale) and the network is not retried for `retryAfterFailureMs`.
 * - With `localDir` set, files are read from disk and the network is never used.
 */
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type ResourceName = 'data.json' | 'availability.json';

export type DataStoreOptions = {
	/** Base URL the files are downloaded from, e.g. `https://alkometriikka.fi`. */
	baseUrl: string;
	/** Directory the downloaded files and their HTTP metadata are cached in. */
	cacheDir: string;
	/** Read files from this directory instead of downloading them. */
	localDir?: string;
	/** How long a cached file is used before it is revalidated. */
	ttlMs: number;
	/** After a failed download, how long to serve the stale cache before trying again. */
	retryAfterFailureMs: number;
	/** Per-request timeout. */
	timeoutMs: number;
	userAgent: string;
	fetch?: FetchLike;
	now?: () => number;
};

type CacheMeta = {
	url: string;
	etag?: string;
	lastModified?: string;
	/** When the cached body was downloaded. */
	fetchedAt: number;
	/** When the cached body was last confirmed current (downloaded or `304`). */
	validatedAt: number;
};

export type ResourceState = {
	/** Absolute path of the file holding the current content. */
	path: string;
	/** Changes whenever the content changes; used to decide when to re-parse. */
	version: string;
	source: 'network' | 'cache' | 'local';
	fetchedAt?: string;
	validatedAt?: string;
	/** True when revalidation failed and an older cached copy is being served. */
	stale: boolean;
	warning?: string;
};

/** Raised when a file is neither downloadable nor available in the cache. */
export class DataUnavailableError extends Error {
	constructor(message: string, options?: { cause?: unknown }) {
		super(message, options);
		this.name = 'DataUnavailableError';
	}
}

function errorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}

export class CachedResource {
	private meta: CacheMeta | null | undefined;
	private lastFailureAt: number | null = null;
	private lastFailure = '';
	private readonly fetch: FetchLike;
	private readonly now: () => number;

	constructor(
		readonly name: ResourceName,
		private readonly options: DataStoreOptions,
		/** Throws if the downloaded text is not a usable file of this kind. */
		private readonly validate: (text: string) => void
	) {
		this.fetch = options.fetch ?? ((input, init) => fetch(input, init));
		this.now = options.now ?? Date.now;
	}

	private get url() {
		return `${this.options.baseUrl.replace(/\/+$/, '')}/${this.name}`;
	}

	private get bodyPath() {
		return join(this.options.cacheDir, this.name);
	}

	private get metaPath() {
		return join(this.options.cacheDir, `${this.name}.meta.json`);
	}

	private async readMeta(): Promise<CacheMeta | null> {
		if (this.meta !== undefined) return this.meta;
		try {
			const meta = JSON.parse(await readFile(this.metaPath, 'utf8')) as CacheMeta;
			await stat(this.bodyPath);
			// A cache written for a different base URL must not be served.
			this.meta =
				meta.url === this.url &&
				Number.isFinite(meta.fetchedAt) &&
				Number.isFinite(meta.validatedAt)
					? meta
					: null;
		} catch {
			this.meta = null;
		}
		return this.meta;
	}

	private async writeMeta(meta: CacheMeta) {
		this.meta = meta;
		await writeAtomic(this.metaPath, JSON.stringify(meta));
	}

	private toState(
		meta: CacheMeta,
		source: ResourceState['source'],
		warning?: string
	): ResourceState {
		return {
			path: this.bodyPath,
			version: `${meta.fetchedAt}:${meta.etag ?? ''}`,
			source,
			fetchedAt: new Date(meta.fetchedAt).toISOString(),
			validatedAt: new Date(meta.validatedAt).toISOString(),
			stale: Boolean(warning),
			warning
		};
	}

	async load(): Promise<ResourceState> {
		if (this.options.localDir) return this.loadLocal(this.options.localDir);

		const meta = await this.readMeta();
		const now = this.now();

		if (meta && now - meta.validatedAt < this.options.ttlMs) return this.toState(meta, 'cache');

		if (
			this.lastFailureAt !== null &&
			now - this.lastFailureAt < this.options.retryAfterFailureMs
		) {
			if (meta) return this.toState(meta, 'cache', this.staleWarning(meta));
			throw new DataUnavailableError(
				`${this.url} is unavailable (${this.lastFailure}) and no cached copy exists. ` +
					`Not retrying until ${new Date(this.lastFailureAt + this.options.retryAfterFailureMs).toISOString()}.`
			);
		}

		try {
			const state = await this.download(meta);
			this.lastFailureAt = null;
			return state;
		} catch (error) {
			this.lastFailureAt = this.now();
			this.lastFailure = errorMessage(error);
			if (meta) return this.toState(meta, 'cache', this.staleWarning(meta));
			throw new DataUnavailableError(
				`Could not download ${this.url} and no cached copy exists: ${this.lastFailure}`,
				{ cause: error }
			);
		}
	}

	private staleWarning(meta: CacheMeta) {
		return (
			`Could not refresh ${this.name} (${this.lastFailure}); serving the cached copy ` +
			`downloaded ${new Date(meta.fetchedAt).toISOString()}.`
		);
	}

	private async download(meta: CacheMeta | null): Promise<ResourceState> {
		const headers: Record<string, string> = {
			'User-Agent': this.options.userAgent,
			Accept: 'application/json'
		};
		if (meta?.etag) headers['If-None-Match'] = meta.etag;
		if (meta?.lastModified) headers['If-Modified-Since'] = meta.lastModified;

		const response = await this.fetch(this.url, {
			headers,
			signal: AbortSignal.timeout(this.options.timeoutMs)
		});
		const now = this.now();

		if (response.status === 304 && meta) {
			await this.writeMeta({ ...meta, validatedAt: now });
			return this.toState(this.meta!, 'cache');
		}
		if (!response.ok) {
			throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());
		}

		const text = await response.text();
		this.validate(text);

		await mkdir(this.options.cacheDir, { recursive: true });
		await writeAtomic(this.bodyPath, text);
		await this.writeMeta({
			url: this.url,
			etag: response.headers.get('etag') ?? undefined,
			lastModified: response.headers.get('last-modified') ?? undefined,
			fetchedAt: now,
			validatedAt: now
		});
		return this.toState(this.meta!, 'network');
	}

	private async loadLocal(dir: string): Promise<ResourceState> {
		const path = join(dir, this.name);
		try {
			const info = await stat(path);
			const modified = new Date(info.mtimeMs).toISOString();
			return {
				path,
				version: `${info.mtimeMs}:${info.size}`,
				source: 'local',
				fetchedAt: modified,
				validatedAt: modified,
				stale: false
			};
		} catch (error) {
			throw new DataUnavailableError(`Local data file ${path} is not readable`, { cause: error });
		}
	}
}

async function writeAtomic(path: string, content: string) {
	const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
	await writeFile(tmp, content);
	await rename(tmp, path);
}

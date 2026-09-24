import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import type { DataStoreOptions } from './data-store.ts';

export const SERVER_NAME = 'alkometriikka';
export const SERVER_VERSION = '0.1.0';

const MINUTE = 60 * 1000;

function positiveNumber(value: string | undefined, fallback: number): number {
	const parsed = Number(value);
	return value && Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function defaultCacheDir(env: NodeJS.ProcessEnv): string {
	const base = env.XDG_CACHE_HOME || join(homedir(), '.cache');
	return join(base, 'alkometriikka-mcp');
}

/**
 * Reads the server configuration from environment variables:
 *
 * - `ALKOMETRIIKKA_BASE_URL`   where data is downloaded from (default https://alkometriikka.fi)
 * - `ALKOMETRIIKKA_CACHE_DIR`  cache directory (default $XDG_CACHE_HOME/alkometriikka-mcp or ~/.cache/…)
 * - `ALKOMETRIIKKA_DATA_DIR`   read data.json/availability.json from this directory instead (offline)
 * - `ALKOMETRIIKKA_CACHE_TTL_MINUTES`  how long cached data is used before revalidating (default 60, min 10)
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): DataStoreOptions {
	return {
		baseUrl: env.ALKOMETRIIKKA_BASE_URL || 'https://alkometriikka.fi',
		cacheDir: env.ALKOMETRIIKKA_CACHE_DIR
			? resolve(env.ALKOMETRIIKKA_CACHE_DIR)
			: defaultCacheDir(env),
		localDir: env.ALKOMETRIIKKA_DATA_DIR ? resolve(env.ALKOMETRIIKKA_DATA_DIR) : undefined,
		// The upstream data is regenerated every 6 hours; there is no point checking much more often,
		// so the TTL cannot be set below 10 minutes.
		ttlMs: Math.max(10, positiveNumber(env.ALKOMETRIIKKA_CACHE_TTL_MINUTES, 60)) * MINUTE,
		retryAfterFailureMs: 5 * MINUTE,
		timeoutMs: 60 * 1000,
		userAgent: `${SERVER_NAME}-mcp/${SERVER_VERSION} (+https://alkometriikka.fi)`
	};
}

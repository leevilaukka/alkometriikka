import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { CryptoHasher } from 'bun';

export interface DownloadOptions {
	/** When set, the downloaded PDF is cached here and re-read from disk on subsequent runs. */
	cacheDir?: string;
	/** Bypass the cache and re-download even if a cached copy exists. */
	forceRefresh?: boolean;
}

/** Downloads a PDF and returns its raw bytes, optionally caching it to disk by URL hash. */
export async function downloadPdf(url: string, options: DownloadOptions = {}): Promise<Uint8Array> {
	const cachePath = options.cacheDir ? path.join(options.cacheDir, cacheFileName(url)) : undefined;

	if (cachePath && !options.forceRefresh) {
		const cached = Bun.file(cachePath);
		if (await cached.exists()) {
			return new Uint8Array(await cached.arrayBuffer());
		}
	}

	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(
			`Failed to download PDF from ${url}: ${response.status} ${response.statusText}`
		);
	}
	const bytes = new Uint8Array(await response.arrayBuffer());

	if (cachePath) {
		await mkdir(path.dirname(cachePath), { recursive: true });
		await Bun.write(cachePath, bytes);
	}

	return bytes;
}

function cacheFileName(url: string): string {
	const hash = new CryptoHasher('sha256').update(url).digest('hex').slice(0, 16);
	const base = path.basename(new URL(url).pathname) || 'document.pdf';
	return `${hash}-${base}`;
}

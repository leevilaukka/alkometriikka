export const REQUEST_HEADERS = {
	'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:147.0) Gecko/20100101 Firefox/147.0'
};

type FetchImageOptions = {
	attempts: number;
	timeoutMs: number;
	/** Delay in ms before retrying after the given zero-based attempt. */
	backoffMs: (attempt: number) => number;
};

/**
 * Downloads a product photo from Alko. Resolves to `null` when no photo exists
 * (4xx) so callers can fall back to a placeholder instead of failing forever.
 */
export async function fetchProductImage(
	id: string,
	{ attempts, timeoutMs, backoffMs }: FetchImageOptions
): Promise<ArrayBuffer | null> {
	const url = `https://images.alko.fi/images/cs_srgb,f_auto,t_medium/cdn/${encodeURIComponent(id)}/kuva.jpg`;
	let lastError: unknown;
	for (let attempt = 0; attempt < attempts; attempt += 1) {
		try {
			const response = await fetch(url, {
				headers: REQUEST_HEADERS,
				signal: AbortSignal.timeout(timeoutMs)
			});
			if (response.status >= 400 && response.status < 500) return null;
			if (!response.ok) throw new Error(`Alko image HTTP ${response.status}`);
			return await response.arrayBuffer();
		} catch (error) {
			lastError = error;
			await new Promise((resolve) => setTimeout(resolve, backoffMs(attempt)));
		}
	}
	throw lastError instanceof Error ? lastError : new Error('image fetch failed');
}

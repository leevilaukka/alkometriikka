/**
 * Set by the service worker on JSON it serves from its cache instead of the network, so the app
 * can tell visitors they're looking at the last copy that loaded.
 */
export const CACHED_RESPONSE_HEADER = 'x-alkometriikka-cached';

export function isCachedResponse(response: Response) {
	return response.headers.get(CACHED_RESPONSE_HEADER) === 'true';
}

/**
 * True when `latest`, a file's `Last-Modified` on the server now, is later than `loaded`, the one
 * it had when the page loaded it. Missing or unreadable dates say nothing, and an older date is
 * just a CDN edge that hasn't caught up yet.
 */
export function isNewerFile(loaded: string | null, latest: string | null) {
	if (!loaded || !latest) return false;
	const loadedTime = Date.parse(loaded);
	const latestTime = Date.parse(latest);
	return !Number.isNaN(loadedTime) && !Number.isNaN(latestTime) && latestTime > loadedTime;
}

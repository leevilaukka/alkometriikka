/**
 * Set by the service worker on JSON it serves from its cache instead of the network, so the app
 * can tell visitors they're looking at the last copy that loaded.
 */
export const CACHED_RESPONSE_HEADER = 'x-alkometriikka-cached';

export function isCachedResponse(response: Response) {
	return response.headers.get(CACHED_RESPONSE_HEADER) === 'true';
}

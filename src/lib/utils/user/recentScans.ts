// Products the scanner opened during this visit, newest first, so comparing bottles at the shelf
// doesn't mean remembering each one. Kept in sessionStorage: it survives going to a product page
// and back (and a reload), but not the tab, as a scan session is one trip to the store.

export const RECENT_SCANS_KEY = 'recent_scans';
export const MAX_RECENT_SCANS = 10;

/** The list with `id` moved to the front, without duplicates, at most `max` long */
export function withScan(ids: readonly string[], id: string, max = MAX_RECENT_SCANS): string[] {
	return [id, ...ids.filter((other) => other !== id)].slice(0, max);
}

/** Product numbers from stored JSON; anything malformed is dropped */
export function parseRecentScans(raw: string | null): string[] {
	if (!raw) return [];
	try {
		const value: unknown = JSON.parse(raw);
		if (!Array.isArray(value)) return [];
		return [
			...new Set(value.filter((id): id is string => typeof id === 'string' && id !== ''))
		].slice(0, MAX_RECENT_SCANS);
	} catch {
		return [];
	}
}

// Storage can be blocked (private modes, embedded browsers); the list then lasts until the page is left
export function readRecentScans(): string[] {
	try {
		return parseRecentScans(sessionStorage.getItem(RECENT_SCANS_KEY));
	} catch {
		return [];
	}
}

export function writeRecentScans(ids: readonly string[]) {
	try {
		if (ids.length) sessionStorage.setItem(RECENT_SCANS_KEY, JSON.stringify(ids));
		else sessionStorage.removeItem(RECENT_SCANS_KEY);
	} catch {
		// Kept in memory only
	}
}

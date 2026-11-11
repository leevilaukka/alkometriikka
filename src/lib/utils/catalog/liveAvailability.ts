import { API_ORIGIN } from '$lib/utils/constants/app';

/**
 * How many units of a product each store has right now, from the API Worker (workers/api,
 * docs/api-worker.md). availability.json, from the sync, only says which stores had it at the
 * last sync; these counts are at most ~15 minutes old.
 */
export type LiveStoreCounts = {
	/** When Alko gave the counts */
	fetchedAt: Date;
	/** Store id → units in stock, only stores that have some */
	counts: Map<string, number>;
};

/** How long this page reuses an answer (the Worker's own answers are cacheable this long too) */
const REUSE_MS = 5 * 60 * 1000;
const requests = new Map<string, { request: Promise<LiveStoreCounts | null>; at: number }>();

/** Forgets the remembered answers (for tests) */
export function clearLiveAvailability() {
	requests.clear();
}

/** Parses the Worker's `{ fetchedAt, counts }`, or null for anything else */
export function parseLiveAvailability(body: unknown): LiveStoreCounts | null {
	if (!body || typeof body !== 'object') return null;
	const { fetchedAt, counts } = body as { fetchedAt?: unknown; counts?: unknown };
	const at = typeof fetchedAt === 'string' ? new Date(fetchedAt) : null;
	if (!at || Number.isNaN(at.getTime()) || !counts || typeof counts !== 'object') return null;
	const parsed = new Map<string, number>();
	for (const [storeId, count] of Object.entries(counts)) {
		if (typeof count === 'number' && Number.isFinite(count) && count > 0) {
			parsed.set(storeId, count);
		}
	}
	return { fetchedAt: at, counts: parsed };
}

async function fetchLive(productId: string, fetchFn: typeof fetch) {
	try {
		const response = await fetchFn(`${API_ORIGIN}/availability/${encodeURIComponent(productId)}`);
		return response.ok ? parseLiveAvailability(await response.json()) : null;
	} catch {
		return null;
	}
}

/**
 * The product's live store counts, or null when the Worker can't give them (offline, over the
 * rate limit, Alko down). The page then keeps showing availability.json. Answers are reused for a
 * few minutes and concurrent calls share one request; failures aren't kept, so a retry can work.
 */
export function loadLiveAvailability(
	productId: string,
	fetchFn: typeof fetch = fetch
): Promise<LiveStoreCounts | null> {
	const known = requests.get(productId);
	if (known && Date.now() - known.at < REUSE_MS) return known.request;
	const entry = { request: fetchLive(productId, fetchFn), at: Date.now() };
	requests.set(productId, entry);
	entry.request.then((live) => {
		if (!live && requests.get(productId) === entry) requests.delete(productId);
	});
	return entry.request;
}

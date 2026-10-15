/**
 * Site notices shown as a banner under the header. Manual notices come from
 * `notices.json`, so a message can go out without touching app code; the
 * staleness warning is derived from the dataset's `LastSynced` and needs no one
 * to notice that the sync has stopped working. The cached-data notice says when
 * the app is offline or showing the service worker's stored copy of the data.
 */

export type NoticeLevel = 'info' | 'warning';

export type Notice = {
	/** Stable id; dismissals are remembered per id, so change it to show a notice again. */
	id: string;
	level: NoticeLevel;
	message: string;
	link?: { href: string; label: string };
	/** ISO timestamps bounding when the notice is shown. */
	startsAt?: string;
	expiresAt?: string;
	/** Defaults to true. Keep critical notices up with `false`. */
	dismissible: boolean;
	/** Hides the automatic stale-data warning while this notice is shown, e.g. to explain the outage. */
	replacesStaleWarning: boolean;
	/**
	 * Only shown to visitors who landed with all of these query params, e.g. a welcome for
	 * `?utm_campaign=kilta`. Each value is one or more accepted values, matched case-insensitively.
	 */
	urlParams?: Record<string, string[]>;
};

/** The sync runs every 6 hours, so this allows a few failed runs before warning. */
export const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export const STALE_NOTICE_ID = 'stale-data';

export const CACHED_NOTICE_ID = 'cached-data';

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidDate(value: unknown): value is string {
	return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

/**
 * The message and link label in `locale`, from the notice's `translations`. Falls back to the
 * Finnish text for anything that isn't translated.
 */
function localizedText(
	entry: Record<string, unknown>,
	locale: string
): { message: unknown; linkLabel?: unknown } {
	const translations = isRecord(entry.translations) ? entry.translations : undefined;
	const translation = translations && isRecord(translations[locale]) ? translations[locale] : {};
	const message =
		typeof translation.message === 'string' && translation.message.trim()
			? translation.message
			: entry.message;
	const linkLabel =
		typeof translation.linkLabel === 'string' && translation.linkLabel.trim()
			? translation.linkLabel
			: undefined;
	return { message, linkLabel };
}

function parseLink(value: unknown, labelOverride?: unknown): Notice['link'] {
	if (!isRecord(value)) return undefined;
	const { href } = value;
	const label = typeof labelOverride === 'string' ? labelOverride : value.label;
	if (typeof href !== 'string' || typeof label !== 'string' || !label.trim()) return undefined;
	// Only same-site paths and https links; never javascript: or data: URLs
	if (!href.startsWith('/') && !href.startsWith('https://')) return undefined;
	return { href, label: label.trim() };
}

/**
 * `null` when present but malformed, so a broken filter hides the notice
 * instead of showing it to everyone.
 */
function parseUrlParams(value: unknown): Notice['urlParams'] | null {
	if (value === undefined) return undefined;
	if (!isRecord(value)) return null;
	const entries = Object.entries(value);
	if (!entries.length) return null;
	const params: Record<string, string[]> = {};
	for (const [key, raw] of entries) {
		const values = (Array.isArray(raw) ? raw : [raw]).map((v) =>
			typeof v === 'string' ? v.trim().toLowerCase() : ''
		);
		if (!key.trim() || !values.length || values.some((v) => !v)) return null;
		params[key.trim()] = values;
	}
	return params;
}

/**
 * Validates a parsed `notices.json`, dropping malformed entries instead of failing the whole
 * file. Texts are taken in `locale` when the notice has a translation for it.
 */
export function parseNotices(raw: unknown, locale = 'fi'): Notice[] {
	const list = isRecord(raw) ? raw.notices : undefined;
	if (!Array.isArray(list)) return [];
	const notices: Notice[] = [];
	const seen = new Set<string>();
	for (const entry of list) {
		if (!isRecord(entry)) continue;
		const { id, level, startsAt, expiresAt, dismissible, replacesStaleWarning } = entry;
		if (typeof id !== 'string' || !id.trim() || seen.has(id)) continue;
		// The Finnish message is required even when a translation is shown
		if (typeof entry.message !== 'string' || !entry.message.trim()) continue;
		const { message, linkLabel } = localizedText(entry, locale);
		if (typeof message !== 'string' || !message.trim()) continue;
		const urlParams = parseUrlParams(entry.urlParams);
		if (urlParams === null) continue;
		seen.add(id);
		notices.push({
			id,
			level: level === 'warning' ? 'warning' : 'info',
			message: message.trim(),
			link: parseLink(entry.link, linkLabel),
			startsAt: isValidDate(startsAt) ? startsAt : undefined,
			expiresAt: isValidDate(expiresAt) ? expiresAt : undefined,
			dismissible: dismissible !== false,
			replacesStaleWarning: replacesStaleWarning === true,
			urlParams
		});
	}
	return notices;
}

export function isNoticeActive(notice: Notice, now: number): boolean {
	if (notice.startsAt && Date.parse(notice.startsAt) > now) return false;
	if (notice.expiresAt && Date.parse(notice.expiresAt) <= now) return false;
	return true;
}

/** True when the notice targets no one in particular, or every one of its params matches. */
export function matchesUrlParams(notice: Notice, params: URLSearchParams): boolean {
	if (!notice.urlParams) return true;
	return Object.entries(notice.urlParams).every(([key, values]) =>
		params.getAll(key).some((value) => values.includes(value.trim().toLowerCase()))
	);
}

/** True when the last successful sync is older than {@link STALE_AFTER_MS}. Unknown is not stale. */
export function isDataStale(lastSynced: string | undefined, now: number): boolean {
	if (!isValidDate(lastSynced)) return false;
	return now - Date.parse(lastSynced) > STALE_AFTER_MS;
}

/**
 * The notices to show: active manual notices aimed at this visitor and not yet
 * dismissed, preceded by the stale-data warning unless a manual notice replaces it. The stale warning's id
 * includes the sync time, so dismissing it only lasts until the data changes.
 *
 * A `cachedMessage` (offline, or showing stored data) takes the stale warning's place: old data
 * then says nothing about the sync, and the message already gives the data's age.
 */
export function visibleNotices(
	notices: Notice[],
	{
		lastSynced,
		dismissed,
		now,
		staleMessage,
		cachedMessage,
		params = new URLSearchParams()
	}: {
		lastSynced?: string;
		dismissed: Set<string>;
		now: number;
		staleMessage: string;
		cachedMessage?: string;
		/** The params the visitor landed with, for notices aimed at a campaign link. */
		params?: URLSearchParams;
	}
): Notice[] {
	const active = notices.filter(
		(notice) => isNoticeActive(notice, now) && matchesUrlParams(notice, params)
	);
	const visible = active.filter((notice) => !notice.dismissible || !dismissed.has(notice.id));
	if (cachedMessage) {
		const cachedId = `${CACHED_NOTICE_ID}:${lastSynced}`;
		if (!dismissed.has(cachedId)) {
			visible.unshift({
				id: cachedId,
				level: 'info',
				message: cachedMessage,
				dismissible: true,
				replacesStaleWarning: false
			});
		}
		return visible;
	}
	const staleId = `${STALE_NOTICE_ID}:${lastSynced}`;
	if (
		isDataStale(lastSynced, now) &&
		!active.some((notice) => notice.replacesStaleWarning) &&
		!dismissed.has(staleId)
	) {
		visible.unshift({
			id: staleId,
			level: 'warning',
			message: staleMessage,
			dismissible: true,
			replacesStaleWarning: false
		});
	}
	return visible;
}

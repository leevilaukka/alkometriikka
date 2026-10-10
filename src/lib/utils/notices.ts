/**
 * Site notices shown as a banner under the header. Manual notices come from
 * `notices.json`, so a message can go out without touching app code; the
 * staleness warning is derived from the dataset's `LastSynced` and needs no one
 * to notice that the sync has stopped working.
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
};

/** The sync runs every 6 hours, so this allows a few failed runs before warning. */
export const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export const STALE_NOTICE_ID = 'stale-data';

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidDate(value: unknown): value is string {
	return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function parseLink(value: unknown): Notice['link'] {
	if (!isRecord(value)) return undefined;
	const { href, label } = value;
	if (typeof href !== 'string' || typeof label !== 'string' || !label.trim()) return undefined;
	// Only same-site paths and https links; never javascript: or data: URLs
	if (!href.startsWith('/') && !href.startsWith('https://')) return undefined;
	return { href, label: label.trim() };
}

/** Validates a parsed `notices.json`, dropping malformed entries instead of failing the whole file. */
export function parseNotices(raw: unknown): Notice[] {
	const list = isRecord(raw) ? raw.notices : undefined;
	if (!Array.isArray(list)) return [];
	const notices: Notice[] = [];
	const seen = new Set<string>();
	for (const entry of list) {
		if (!isRecord(entry)) continue;
		const { id, level, message, startsAt, expiresAt, dismissible, replacesStaleWarning } = entry;
		if (typeof id !== 'string' || !id.trim() || seen.has(id)) continue;
		if (typeof message !== 'string' || !message.trim()) continue;
		seen.add(id);
		notices.push({
			id,
			level: level === 'warning' ? 'warning' : 'info',
			message: message.trim(),
			link: parseLink(entry.link),
			startsAt: isValidDate(startsAt) ? startsAt : undefined,
			expiresAt: isValidDate(expiresAt) ? expiresAt : undefined,
			dismissible: dismissible !== false,
			replacesStaleWarning: replacesStaleWarning === true
		});
	}
	return notices;
}

export function isNoticeActive(notice: Notice, now: number): boolean {
	if (notice.startsAt && Date.parse(notice.startsAt) > now) return false;
	if (notice.expiresAt && Date.parse(notice.expiresAt) <= now) return false;
	return true;
}

/** True when the last successful sync is older than {@link STALE_AFTER_MS}. Unknown is not stale. */
export function isDataStale(lastSynced: string | undefined, now: number): boolean {
	if (!isValidDate(lastSynced)) return false;
	return now - Date.parse(lastSynced) > STALE_AFTER_MS;
}

/**
 * The notices to show: active manual notices not yet dismissed, preceded by the
 * stale-data warning unless a manual notice replaces it. The stale warning's id
 * includes the sync time, so dismissing it only lasts until the data changes.
 */
export function visibleNotices(
	notices: Notice[],
	{
		lastSynced,
		dismissed,
		now,
		staleMessage
	}: { lastSynced?: string; dismissed: Set<string>; now: number; staleMessage: string }
): Notice[] {
	const active = notices.filter((notice) => isNoticeActive(notice, now));
	const visible = active.filter((notice) => !notice.dismissible || !dismissed.has(notice.id));
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

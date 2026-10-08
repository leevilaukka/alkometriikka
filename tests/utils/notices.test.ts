import { describe, expect, it } from 'bun:test';
import {
	STALE_AFTER_MS,
	isDataStale,
	isNoticeActive,
	parseNotices,
	visibleNotices,
	type Notice
} from '$lib/utils/notices';

const now = Date.parse('2026-10-09T12:00:00.000Z');
const hour = 60 * 60 * 1000;

function notice(overrides: Partial<Notice> = {}): Notice {
	return {
		id: 'n1',
		level: 'info',
		message: 'Hei',
		dismissible: true,
		replacesStaleWarning: false,
		...overrides
	};
}

describe('parseNotices', () => {
	it('returns nothing for malformed files', () => {
		expect(parseNotices(null)).toEqual([]);
		expect(parseNotices([])).toEqual([]);
		expect(parseNotices({ notices: 'x' })).toEqual([]);
	});

	it('fills in defaults and drops invalid entries', () => {
		const parsed = parseNotices({
			notices: [
				{ id: 'a', message: ' Uusi ominaisuus ', level: 'nope', startsAt: 'not a date' },
				{ id: 'a', message: 'duplicate id' },
				{ id: '', message: 'no id' },
				{ id: 'b', message: '' },
				'string',
				{
					id: 'c',
					message: 'Huolto',
					level: 'warning',
					dismissible: false,
					replacesStaleWarning: true
				}
			]
		});
		expect(parsed).toEqual([
			notice({ id: 'a', message: 'Uusi ominaisuus' }),
			notice({
				id: 'c',
				message: 'Huolto',
				level: 'warning',
				dismissible: false,
				replacesStaleWarning: true
			})
		]);
	});

	it('only keeps same-site and https links', () => {
		const links = [
			{ href: '/kategoriat', label: 'Kategoriat' },
			{ href: 'https://github.com', label: 'GitHub' },
			{ href: 'javascript:alert(1)', label: 'x' },
			{ href: 'http://example.com', label: 'x' },
			{ href: '/x', label: ' ' }
		];
		const parsed = parseNotices({
			notices: links.map((link, i) => ({ id: String(i), message: 'm', link }))
		});
		expect(parsed.map((n) => n.link)).toEqual([
			links[0],
			links[1],
			undefined,
			undefined,
			undefined
		]);
	});
});

describe('isNoticeActive', () => {
	it('respects the start and expiry times', () => {
		expect(isNoticeActive(notice(), now)).toBe(true);
		expect(isNoticeActive(notice({ startsAt: '2026-10-10T00:00:00Z' }), now)).toBe(false);
		expect(isNoticeActive(notice({ expiresAt: '2026-10-09T12:00:00Z' }), now)).toBe(false);
		expect(
			isNoticeActive(
				notice({ startsAt: '2026-10-01T00:00:00Z', expiresAt: '2026-10-20T00:00:00Z' }),
				now
			)
		).toBe(true);
	});
});

describe('isDataStale', () => {
	it('warns only once the last sync is older than the threshold', () => {
		expect(isDataStale(new Date(now - STALE_AFTER_MS + hour).toISOString(), now)).toBe(false);
		expect(isDataStale(new Date(now - STALE_AFTER_MS - hour).toISOString(), now)).toBe(true);
	});

	it('treats a missing or invalid sync time as fresh', () => {
		expect(isDataStale(undefined, now)).toBe(false);
		expect(isDataStale('garbage', now)).toBe(false);
	});
});

describe('visibleNotices', () => {
	const staleSync = new Date(now - 2 * STALE_AFTER_MS).toISOString();
	const freshSync = new Date(now - hour).toISOString();
	const base = { dismissed: new Set<string>(), now, staleMessage: 'Vanhaa dataa' };

	it('adds the stale warning first when the data is old', () => {
		const visible = visibleNotices([notice()], { ...base, lastSynced: staleSync });
		expect(visible.map((n) => n.id)).toEqual([`stale-data:${staleSync}`, 'n1']);
		expect(visible[0].message).toBe('Vanhaa dataa');
	});

	it('leaves the stale warning out when the data is fresh', () => {
		expect(visibleNotices([], { ...base, lastSynced: freshSync })).toEqual([]);
	});

	it('lets an active manual notice replace the stale warning', () => {
		const replacing = notice({ id: 'outage', replacesStaleWarning: true });
		expect(
			visibleNotices([replacing], { ...base, lastSynced: staleSync }).map((n) => n.id)
		).toEqual(['outage']);
		const expired = { ...replacing, expiresAt: '2026-10-01T00:00:00Z' };
		expect(visibleNotices([expired], { ...base, lastSynced: staleSync }).map((n) => n.id)).toEqual([
			`stale-data:${staleSync}`
		]);
	});

	it('hides dismissed notices unless they cannot be dismissed', () => {
		const dismissed = new Set(['n1', 'n2', `stale-data:${staleSync}`]);
		const visible = visibleNotices([notice(), notice({ id: 'n2', dismissible: false })], {
			...base,
			dismissed,
			lastSynced: staleSync
		});
		expect(visible.map((n) => n.id)).toEqual(['n2']);
	});

	it('shows the stale warning again after a newer sync goes stale', () => {
		const dismissed = new Set([`stale-data:${staleSync}`]);
		const laterStale = new Date(now - STALE_AFTER_MS - hour).toISOString();
		expect(
			visibleNotices([], { ...base, dismissed, lastSynced: laterStale }).map((n) => n.id)
		).toEqual([`stale-data:${laterStale}`]);
	});
});

describe('notices.json', () => {
	it('parses without dropping any entries', async () => {
		const raw = await Bun.file('static/notices.json').json();
		expect(parseNotices(raw)).toHaveLength(raw.notices.length);
	});

	it('has a schema describing every field the parser reads', async () => {
		const schema = await Bun.file('schemas/notices.schema.json').json();
		const parsed = parseNotices({
			notices: [
				{
					id: 'a',
					message: 'm',
					link: { href: '/', label: 'l' },
					startsAt: '2026-01-01T00:00:00Z',
					expiresAt: '2026-01-02T00:00:00Z'
				}
			]
		});
		expect(Object.keys(schema.definitions.notice.properties).sort()).toEqual(
			Object.keys(parsed[0]).sort()
		);
	});
});

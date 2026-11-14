import { describe, expect, it } from 'bun:test';
import { formatRelativeTime, formatTimeAgo } from '$lib/utils/format/format';

const now = new Date('2026-11-10T12:00:00Z');
const minutes = (count: number) => new Date(now.getTime() + count * 60_000);

describe('formatTimeAgo', () => {
	it('says how long ago a past time was', () => {
		expect(formatTimeAgo(minutes(-3), now)).toBe(formatRelativeTime(minutes(-3), now));
		expect(formatTimeAgo(minutes(-3), now)).toContain('sitten');
	});

	it('calls anything under a minute ago "juuri nyt"', () => {
		expect(formatTimeAgo(new Date(now.getTime() - 20_000), now)).toBe('juuri nyt');
	});

	it('never puts an update in the future', () => {
		// A server clock ahead of the device's, or a `now` that hasn't been refreshed
		expect(formatTimeAgo(minutes(1), now)).toBe('juuri nyt');
		expect(formatTimeAgo(minutes(5), now)).toBe('juuri nyt');
		expect(formatRelativeTime(minutes(1), now)).not.toBe('juuri nyt');
	});
});

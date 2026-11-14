import { describe, expect, it } from 'bun:test';
import { isNewerFile } from '$lib/utils/app/offline';

describe('isNewerFile', () => {
	const loaded = 'Tue, 27 Oct 2026 10:44:53 GMT';

	it('is true when the server has a later copy', () => {
		expect(isNewerFile(loaded, 'Tue, 27 Oct 2026 16:44:53 GMT')).toBe(true);
	});

	it('is false for the same or an older copy', () => {
		expect(isNewerFile(loaded, loaded)).toBe(false);
		expect(isNewerFile(loaded, 'Tue, 27 Oct 2026 04:44:53 GMT')).toBe(false);
	});

	it('is false when either date is missing or unreadable', () => {
		expect(isNewerFile(null, loaded)).toBe(false);
		expect(isNewerFile(loaded, null)).toBe(false);
		expect(isNewerFile('eilen', loaded)).toBe(false);
		expect(isNewerFile(loaded, 'huomenna')).toBe(false);
	});
});

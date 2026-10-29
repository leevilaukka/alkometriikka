import { describe, expect, it } from 'bun:test';
import {
	GuidanceIds,
	INTRO_DAYS,
	initGuidance,
	shouldShowGuidance,
	type GuidanceState
} from '$lib/utils/user/guidance';

const today = '2026-10-29';

describe('initGuidance', () => {
	it('starts a new visitor from today', () => {
		expect(initGuidance(null, today, false)).toEqual({ firstSeen: today, seen: [] });
	});

	it('marks a visitor who used the site before as returning', () => {
		expect(initGuidance(null, today, true)).toEqual({
			firstSeen: today,
			returning: true,
			seen: []
		});
	});

	it('keeps saved state, even once signs of earlier use appear', () => {
		const saved: GuidanceState = { firstSeen: '2026-10-20', seen: [GuidanceIds.Intro] };
		expect(initGuidance(saved, today, true)).toBe(saved);
	});

	it('starts over from a malformed save', () => {
		const broken = { firstSeen: 1 } as unknown as GuidanceState;
		expect(initGuidance(broken, today, false)).toEqual({ firstSeen: today, seen: [] });
	});
});

describe('shouldShowGuidance', () => {
	const fresh: GuidanceState = { firstSeen: today, seen: [] };

	it('shows everything to a new visitor', () => {
		expect(shouldShowGuidance(fresh, GuidanceIds.Intro, today)).toBe(true);
		expect(shouldShowGuidance(fresh, GuidanceIds.StoreFilter, today)).toBe(true);
	});

	it('shows nothing to a returning visitor', () => {
		const returning = { ...fresh, returning: true };
		expect(shouldShowGuidance(returning, GuidanceIds.Intro, today)).toBe(false);
		expect(shouldShowGuidance(returning, GuidanceIds.StoreFilter, today)).toBe(false);
	});

	it('hides what has been seen', () => {
		const seen: GuidanceState = { firstSeen: today, seen: [GuidanceIds.StoreFilter] };
		expect(shouldShowGuidance(seen, GuidanceIds.StoreFilter, today)).toBe(false);
		expect(shouldShowGuidance(seen, GuidanceIds.Intro, today)).toBe(true);
	});

	it(`retires the intro ${INTRO_DAYS} days after the first visit, but not the hints`, () => {
		const lastDay = { firstSeen: '2026-10-23', seen: [] };
		const weekOld = { firstSeen: '2026-10-22', seen: [] };
		expect(shouldShowGuidance(lastDay, GuidanceIds.Intro, today)).toBe(true);
		expect(shouldShowGuidance(weekOld, GuidanceIds.Intro, today)).toBe(false);
		expect(shouldShowGuidance(weekOld, GuidanceIds.StoreFilter, today)).toBe(true);
	});
});

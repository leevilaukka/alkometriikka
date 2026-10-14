import { describe, expect, it } from 'bun:test';
import {
	applyOverrideParams,
	flagSessionData,
	isFlagOn,
	parseFlags,
	rolloutBucket
} from '$lib/utils/flags/flags';

describe('parseFlags', () => {
	it('reads booleans and objects', () => {
		expect(
			parseFlags({ flags: { a: true, b: false, c: { rollout: 25 }, d: { enabled: false } } })
		).toEqual({
			a: { enabled: true },
			b: { enabled: false },
			c: { enabled: true, rollout: 25 },
			d: { enabled: false, rollout: undefined }
		});
	});

	it('drops malformed entries instead of failing the file', () => {
		expect(
			parseFlags({
				flags: {
					ok: true,
					'bad name': true,
					string: 'yes',
					over: { rollout: 101 },
					negative: { rollout: -1 },
					text: { rollout: '10' },
					enabledText: { enabled: 'true' }
				}
			})
		).toEqual({ ok: { enabled: true } });
	});

	it('gives no flags for anything that is not a flags file', () => {
		for (const raw of [null, undefined, [], 'x', {}, { flags: [] }])
			expect(parseFlags(raw)).toEqual({});
	});
});

describe('applyOverrideParams', () => {
	const parse = (query: string, stored = {}) =>
		applyOverrideParams(stored, new URLSearchParams(query));

	it('turns flags on, and off with a minus', () => {
		expect(parse('flag=a,-b')).toEqual({ a: true, b: false });
		expect(parse('flag=a&flag=-b')).toEqual({ a: true, b: false });
	});

	it('keeps stored overrides and lets the URL win', () => {
		expect(parse('flag=-a', { a: true, b: true })).toEqual({ a: false, b: true });
	});

	it('forgets everything stored before reset', () => {
		expect(parse('flag=reset', { a: true })).toEqual({});
		expect(parse('flag=reset,b', { a: true })).toEqual({ b: true });
	});

	it('ignores invalid names and other params', () => {
		expect(parse('flag=,-,a b,x&q=1')).toEqual({ x: true });
		expect(parse('q=1', { a: true })).toEqual({ a: true });
	});
});

describe('isFlagOn', () => {
	it('is off for unknown and disabled flags', () => {
		expect(isFlagOn('a', {}, {}, 'v')).toBe(false);
		expect(isFlagOn('a', { a: { enabled: false } }, {}, 'v')).toBe(false);
		expect(isFlagOn('a', { a: { enabled: false, rollout: 100 } }, {}, 'v')).toBe(false);
	});

	it('is on for everyone without a rollout', () => {
		expect(isFlagOn('a', { a: { enabled: true } }, {}, 'v')).toBe(true);
	});

	it('lets overrides win both ways, even for flags missing from the file', () => {
		expect(isFlagOn('a', { a: { enabled: true } }, { a: false }, 'v')).toBe(false);
		expect(isFlagOn('a', {}, { a: true }, 'v')).toBe(true);
	});

	it('handles the edges of a rollout', () => {
		for (const id of ['1', '2', '3', '4', '5']) {
			expect(isFlagOn('a', { a: { enabled: true, rollout: 0 } }, {}, id)).toBe(false);
			expect(isFlagOn('a', { a: { enabled: true, rollout: 100 } }, {}, id)).toBe(true);
		}
	});
});

describe('flagSessionData', () => {
	it('reports every published and overridden flag as on or off', () => {
		expect(
			flagSessionData(
				{ a: { enabled: true }, b: { enabled: false }, c: { enabled: true, rollout: 0 } },
				{ b: true, d: false },
				'v'
			)
		).toEqual({ flag_a: true, flag_b: true, flag_c: false, flag_d: false });
	});

	it('is empty without flags', () => {
		expect(flagSessionData({}, {}, 'v')).toEqual({});
	});
});

describe('rolloutBucket', () => {
	it('is stable and within 0-99', () => {
		expect(rolloutBucket('visitor', 'a')).toBe(rolloutBucket('visitor', 'a'));
		for (let i = 0; i < 200; i++) {
			const bucket = rolloutBucket(`visitor-${i}`, 'a');
			expect(bucket).toBeGreaterThanOrEqual(0);
			expect(bucket).toBeLessThan(100);
		}
	});

	it('spreads visitors close to the rollout percentage', () => {
		let on = 0;
		for (let i = 0; i < 5000; i++) if (rolloutBucket(crypto.randomUUID(), 'a') < 30) on++;
		expect(on / 5000).toBeGreaterThan(0.26);
		expect(on / 5000).toBeLessThan(0.34);
	});

	it('places a visitor differently for different flags', () => {
		const ids = Array.from({ length: 50 }, (_, i) => `v${i}`);
		expect(
			ids.filter((id) => rolloutBucket(id, 'a') !== rolloutBucket(id, 'b')).length
		).toBeGreaterThan(40);
	});
});

describe('flags.json', () => {
	it('parses without dropping any entries', async () => {
		const raw = await Bun.file('static/flags.json').json();
		expect(Object.keys(parseFlags(raw))).toHaveLength(Object.keys(raw.flags).length);
	});
});

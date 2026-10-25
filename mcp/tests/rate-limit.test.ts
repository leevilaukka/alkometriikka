import { describe, expect, it } from 'bun:test';
import { RateLimiter } from '../rate-limit.ts';

describe('RateLimiter', () => {
	it('allows up to the limit per window, per key, and reports the wait', () => {
		let now = 0;
		const limiter = new RateLimiter(2, 60_000, () => now);
		expect(limiter.hit('a')).toBe(0);
		expect(limiter.hit('a')).toBe(0);
		now = 15_000;
		expect(limiter.hit('a')).toBe(45);
		expect(limiter.hit('b')).toBe(0);
	});

	it('starts a new window once the old one is over', () => {
		let now = 0;
		const limiter = new RateLimiter(1, 1000, () => now);
		expect(limiter.hit('a')).toBe(0);
		expect(limiter.hit('a')).toBeGreaterThan(0);
		now = 1000;
		expect(limiter.hit('a')).toBe(0);
	});
});

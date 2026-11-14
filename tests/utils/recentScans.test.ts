import { describe, expect, it } from 'bun:test';
import { MAX_RECENT_SCANS, parseRecentScans, withScan } from '$lib/utils/user/recentScans';

describe('withScan', () => {
	it('puts a new scan first', () => {
		expect(withScan(['1', '2'], '3')).toEqual(['3', '1', '2']);
	});

	it('moves a product scanned again to the front instead of listing it twice', () => {
		expect(withScan(['1', '2', '3'], '2')).toEqual(['2', '1', '3']);
	});

	it('drops the oldest scans past the limit', () => {
		const full = Array.from({ length: MAX_RECENT_SCANS }, (_, i) => String(i));
		const next = withScan(full, 'new');
		expect(next).toHaveLength(MAX_RECENT_SCANS);
		expect(next[0]).toBe('new');
		expect(next).not.toContain(String(MAX_RECENT_SCANS - 1));
	});
});

describe('parseRecentScans', () => {
	it('reads stored product numbers', () => {
		expect(parseRecentScans('["123","456"]')).toEqual(['123', '456']);
	});

	it('returns nothing for missing, broken or wrongly shaped data', () => {
		expect(parseRecentScans(null)).toEqual([]);
		expect(parseRecentScans('{')).toEqual([]);
		expect(parseRecentScans('{"ids":["1"]}')).toEqual([]);
	});

	it('drops non-string entries and duplicates, and caps the length', () => {
		expect(parseRecentScans('["1",2,null,"1",""]')).toEqual(['1']);
		const many = JSON.stringify(Array.from({ length: 30 }, (_, i) => String(i)));
		expect(parseRecentScans(many)).toHaveLength(MAX_RECENT_SCANS);
	});
});

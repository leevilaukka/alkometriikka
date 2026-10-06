import { describe, expect, it } from 'bun:test';
import { formatCampaignWindow, getSaleInfo, toISODateInTimeZone } from '$lib/utils/sales';

const item = (overrides: Record<string, unknown> = {}) => ({
	price: 8,
	normalPrice: 10,
	...overrides
});

describe('getSaleInfo', () => {
	it('detects a sale and rounds the discount to whole percent', () => {
		expect(getSaleInfo(item())).toEqual({
			salePrice: 8,
			normalPrice: 10,
			discountPercent: 20,
			campaignStart: undefined,
			campaignEnd: undefined
		});
		expect(getSaleInfo(item({ price: 6.66, normalPrice: 10 }))?.discountPercent).toBe(33);
		expect(getSaleInfo(item({ price: 9.95, normalPrice: 10 }))?.discountPercent).toBe(1);
	});

	it('is not a sale when the price equals or exceeds the reference price', () => {
		expect(getSaleInfo(item({ price: 10 }))).toBeNull();
		expect(getSaleInfo(item({ price: 12 }))).toBeNull();
	});

	it('rejects missing, non-numeric and non-positive prices', () => {
		expect(getSaleInfo({})).toBeNull();
		expect(getSaleInfo(item({ price: null }))).toBeNull();
		expect(getSaleInfo(item({ normalPrice: undefined }))).toBeNull();
		expect(getSaleInfo(item({ price: 'abc' }))).toBeNull();
		expect(getSaleInfo(item({ price: 0 }))).toBeNull();
		expect(getSaleInfo(item({ price: -1 }))).toBeNull();
	});

	it('accepts comma-decimal strings', () => {
		expect(getSaleInfo(item({ price: '7,50', normalPrice: '10,00' }))).toMatchObject({
			salePrice: 7.5,
			normalPrice: 10,
			discountPercent: 25
		});
	});

	describe('campaign window', () => {
		const campaign = { campaignStart: '2026-09-20', campaignEnd: '2026-10-10' };

		it('is inclusive of both boundary days', () => {
			expect(getSaleInfo(item(campaign), '2026-09-20')).not.toBeNull();
			expect(getSaleInfo(item(campaign), '2026-10-10')).not.toBeNull();
			expect(getSaleInfo(item(campaign), '2026-10-01')).toMatchObject(campaign);
		});

		it('is not a sale before it starts or after it ends', () => {
			expect(getSaleInfo(item(campaign), '2026-09-19')).toBeNull();
			expect(getSaleInfo(item(campaign), '2026-10-11')).toBeNull();
		});

		it('supports open-ended windows', () => {
			expect(getSaleInfo(item({ campaignStart: '2026-09-20' }), '2027-01-01')).not.toBeNull();
			expect(getSaleInfo(item({ campaignStart: '2026-09-20' }), '2026-09-19')).toBeNull();
			expect(getSaleInfo(item({ campaignEnd: '2026-10-10' }), '2020-01-01')).not.toBeNull();
			expect(getSaleInfo(item({ campaignEnd: '2026-10-10' }), '2026-10-11')).toBeNull();
		});

		it('treats blank dates as no dates and trims whitespace', () => {
			expect(
				getSaleInfo(item({ campaignStart: '  ', campaignEnd: '' }), '2030-01-01')
			).toMatchObject({
				campaignStart: undefined,
				campaignEnd: undefined
			});
			expect(
				getSaleInfo(item({ campaignStart: ' 2026-09-20 ' }), '2026-10-01')?.campaignStart
			).toBe('2026-09-20');
		});

		it('ignores non-string dates', () => {
			expect(
				getSaleInfo(item({ campaignStart: 20260920, campaignEnd: null }), '2020-01-01')
			).not.toBeNull();
		});
	});
});

describe('formatCampaignWindow', () => {
	const sale = (campaignStart?: string, campaignEnd?: string) => ({
		salePrice: 8,
		normalPrice: 10,
		discountPercent: 20,
		campaignStart,
		campaignEnd
	});

	it('formats a full window with Finnish dates', () => {
		expect(formatCampaignWindow(sale('2026-09-02', '2026-09-29'))).toBe('2.9.2026 – 29.9.2026');
	});

	it('formats open-ended and missing windows', () => {
		expect(formatCampaignWindow(sale('2026-09-02'))).toBe('2.9.2026');
		expect(formatCampaignWindow(sale(undefined, '2026-09-29'))).toBe('29.9.2026');
		expect(formatCampaignWindow(sale())).toBeNull();
		expect(formatCampaignWindow(sale('not-a-date', '2026/09/29'))).toBeNull();
	});
});

describe('toISODateInTimeZone', () => {
	it('returns the calendar day in the requested zone, not UTC', () => {
		const lateEveningUtc = new Date('2026-09-22T22:30:00Z');
		expect(toISODateInTimeZone('UTC', lateEveningUtc)).toBe('2026-09-22');
		expect(toISODateInTimeZone('Europe/Helsinki', lateEveningUtc)).toBe('2026-09-23');
		expect(toISODateInTimeZone('America/Los_Angeles', lateEveningUtc)).toBe('2026-09-22');
	});

	it('handles the Helsinki DST change', () => {
		expect(toISODateInTimeZone('Europe/Helsinki', new Date('2026-10-24T21:30:00Z'))).toBe(
			'2026-10-25'
		);
		expect(toISODateInTimeZone('Europe/Helsinki', new Date('2026-10-25T21:30:00Z'))).toBe(
			'2026-10-25'
		);
	});
});

import { describe, expect, it } from 'bun:test';
import { displayImageUrl, fallbackImageUrl, generateImageUrl } from '$lib/utils/catalog/alko';

const CDN = 'https://images.alko.fi/images';

describe('product image URLs', () => {
	it('shares JPEG/WebP photos converted to sRGB', () => {
		expect(generateImageUrl('319027')).toBe(`${CDN}/cs_srgb,f_auto,t_products/cdn/319027/kuva.jpg`);
		expect(generateImageUrl('319027', 'medium')).toBe(
			`${CDN}/cs_srgb,f_auto,t_medium/cdn/319027/kuva.jpg`
		);
	});

	// Alko's CDN 404s combinations it doesn't allow, e.g. cs_srgb,f_auto with t_pdp or t_digipruuvi
	it('shows the transform and format combinations the CDN serves', () => {
		expect(displayImageUrl('319027')).toBe(`${CDN}/t_products/cdn/319027/kuva.webp`);
		expect(displayImageUrl('319027', 'small')).toBe(`${CDN}/t_digipruuvi/cdn/319027/kuva.webp`);
		expect(displayImageUrl('319027', 'medium')).toBe(`${CDN}/t_pdp/cdn/319027/kuva.avif`);
	});

	it('falls back from the AVIF photo only', () => {
		expect(fallbackImageUrl('319027', 'medium')).toBe(generateImageUrl('319027', 'medium'));
		expect(fallbackImageUrl('319027', 'products')).toBeUndefined();
		expect(fallbackImageUrl('319027', 'small')).toBeUndefined();
	});
});

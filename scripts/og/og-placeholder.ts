import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';

/**
 * Fallback OG image tile for products that have no photo on Alko's CDN (their
 * `images.alko.fi/.../kuva.jpg` returns HTTP 400). Rendered directly with resvg
 * so it stays out of scripts/og/og.ts — the design fingerprint only hashes that
 * file (+ favicon + fonts), so adding this fallback does NOT re-key any of the
 * existing content-addressed images.
 */

const RED = '#e51b15';
const FONT_FILE = path.join(
	import.meta.dir,
	'..',
	'..',
	'src/lib/assets/fonts/Inter/static/Inter_18pt-ExtraBold.ttf'
);

function escapeXml(text: string): string {
	return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

/** 1:1 monogram tile sized to fill the OG image's photo slot. */
export function ogPlaceholderPng(seed: string): ArrayBuffer {
	const letter = (seed.trim()[0] ?? '?').toUpperCase();
	const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="420" height="420" viewBox="0 0 420 420">
  <rect x="2" y="2" width="416" height="416" rx="24" fill="#f2f0ea" stroke="#ece9e3" stroke-width="4"/>
  <text x="210" y="210" text-anchor="middle" dominant-baseline="central"
        font-family="Inter" font-size="170" font-weight="800" fill="${RED}">${escapeXml(letter)}</text>
</svg>`.trim();

	const resvg = new Resvg(svg, {
		font: { fontFiles: [FONT_FILE], defaultFontFamily: 'Inter' },
		fitTo: { mode: 'width', value: 420 }
	});
	const png = resvg.render().asPng();
	return png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength) as ArrayBuffer;
}

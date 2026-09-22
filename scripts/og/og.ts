import { CryptoHasher } from 'bun';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import satori from 'satori';
import { getSaleInfo, toISODateInTimeZone } from '../../src/lib/utils/sales';

/**
 * Shared Open Graph image helpers for the Alkometriikka product pages.
 *
 * Both scripts/og/og-images.ts (rendering + R2 upload) and
 * scripts/site/prerender-products.ts (injecting the og:image tag) must agree on the
 * exact derived key for a product. Everything that determines the *visual
 * content* of the image is hashed into the key, so a product whose displayed
 * fields are unchanged reuses the same immutable object in R2 (no re-upload,
 * perfect cache headers).
 */

export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;

/** Custom domain bound to the R2 bucket that serves the OG images. */
export const OG_CDN_BASE = process.env.OG_CDN_BASE || 'https://cdn.alkometriikka.fi';

export const OG_KEY_PREFIX = 'products';
export const OG_HASH_LENGTH = 12;
export const OG_DESIGN_VERSION = process.env.OG_DESIGN_VERSION || '1';

export type OgDisplay = {
	id: string;
	name: string;
	manufacturer?: string;
	category?: string;
	country?: string;
	vintage?: string;
	volume?: number;
	price: number;
	pricePerLitre?: number;
	abv?: number;
	sale?: {
		normalPrice: number;
		salePrice: number;
		discountPercent: number;
	} | null;
};

const FIELD_NAMES = [
	'Numero',
	'Nimi',
	'Valmistaja',
	'Tyyppi',
	'Alatyyppi',
	'Valmistusmaa',
	'Vuosikerta',
	'Pullokoko',
	'Hinta',
	'Litrahinta',
	'Alkoholi-%',
	'Normaalihinta',
	'Kampanja alkaa',
	'Kampanja päättyy'
] as const;

function text(value: unknown): string | undefined {
	if (value === null || value === undefined) return undefined;
	const string = String(value).trim();
	return string || undefined;
}

function capitalizeFirst(value: string | undefined): string | undefined {
	return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function numberValue(value: unknown): number | undefined {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string') {
		const parsed = Number(value.replace(',', '.').replace(/\s/g, '').trim());
		if (Number.isFinite(parsed)) return parsed;
	}
	return undefined;
}

/**
 * Normalizes a legacy-ordered product row into the display payload used by both
 * the renderer and the content hash. Returns `null` when the product has no
 * usable name or id.
 */
export function ogDisplayFields(schema: readonly string[], values: unknown[]): OgDisplay | null {
	if (!Array.isArray(schema) || !Array.isArray(values)) return null;
	const fields = Object.fromEntries(
		schema.map((column, index) => [column, values[index]])
	) as Record<(typeof FIELD_NAMES)[number], unknown>;

	const id = text(fields.Numero);
	const name = text(fields.Nimi);
	if (!id || !name) return null;

	const price = numberValue(fields.Hinta);
	if (price === undefined) return null;

	const normalPrice = numberValue(fields.Normaalihinta);
	const sale = getSaleInfo(
		{
			price,
			normalPrice,
			campaignStart: fields['Kampanja alkaa'],
			campaignEnd: fields['Kampanja päättyy']
		},
		toISODateInTimeZone('Europe/Helsinki')
	);

	return {
		id,
		name,
		manufacturer: text(fields.Valmistaja),
		category: capitalizeFirst(text(fields.Alatyyppi) ?? text(fields.Tyyppi)),
		country: text(fields.Valmistusmaa),
		vintage: text(fields.Vuosikerta),
		volume: numberValue(fields.Pullokoko),
		price,
		pricePerLitre: numberValue(fields.Litrahinta),
		abv: numberValue(fields['Alkoholi-%']),
		sale: sale
			? {
					normalPrice: sale.normalPrice,
					salePrice: sale.salePrice,
					discountPercent: sale.discountPercent
				}
			: null
	};
}

/**
 * Stable SHA-256 hash over everything that affects the rendered image: the
 * product's displayed fields plus the design fingerprint (see below).
 */
export function ogContentHash(display: OgDisplay, design: string = OG_DESIGN_VERSION): string {
	const { id: _id, ...content } = display;
	const hasher = new CryptoHasher('sha256');
	hasher.update(JSON.stringify({ design, content }));
	return hasher.digest('hex');
}

/** Content-addressed object key inside the bucket, e.g. `products/100001-ab12cd34ef56.png`. */
export function ogImageKey(display: OgDisplay, design: string = OG_DESIGN_VERSION): string {
	return `${OG_KEY_PREFIX}/${display.id}-${ogContentHash(display, design).slice(0, OG_HASH_LENGTH)}.png`;
}

/** Public URL for an object key served from the custom R2 domain. */
export function ogImageUrl(key: string): string {
	return `${OG_CDN_BASE}/${key}`;
}

/**
 * The Daily share card is one generic image per calendar day (not
 * personalized per player), so its key is just the date — no content hash
 * needed, since a new day always gets a new key.
 */
export const DAILY_OG_KEY_PREFIX = 'daily';

export function dailyOgKey(date: string): string {
	return `${DAILY_OG_KEY_PREFIX}/${date}.png`;
}

export function dailyOgUrl(date: string): string {
	return ogImageUrl(dailyOgKey(date));
}

function sha256Hex(input: string | ArrayBuffer | Uint8Array): string {
	const hasher = new CryptoHasher('sha256');
	hasher.update(input);
	return hasher.digest('hex');
}

/** Strips comments and collapses whitespace so cosmetic edits don't re-key. */
function normalizeSource(source: string): string {
	return source
		.replace(/\/\*[\s\S]*?\*\//g, ' ')
		.replace(/^\s*\/\/.*$/gm, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

let designFingerprintPromise: Promise<string> | null = null;

/**
 * Fingerprints everything that affects the *layout* of the image without
 * needing to render it: the normalized source of this file, the favicon, and
 * the embedded fonts. Combined into the content hash, so a real layout change
 * (edit to `scripts/og/og.ts`, a new favicon, new font files) re-keys every image
 * and the next run re-renders the whole catalog — while formatting-only edits
 * (prettier, reordering, comments) leave the fingerprint, and thus all keys,
 * untouched. `OG_DESIGN_VERSION` is included as an escape hatch to force a
 * global refresh without touching the code.
 */
export function ogDesignFingerprint(): Promise<string> {
	designFingerprintPromise ??= (async () => {
		try {
			const parts: string[] = [OG_DESIGN_VERSION];
			const sourcePath = path.join(import.meta.dir, 'og.ts');
			const source = await Bun.file(sourcePath).text();
			parts.push(sha256Hex(normalizeSource(source)));
			const favicon = await loadFavicon();
			if (favicon) parts.push(sha256Hex(favicon));
			const fonts = await loadFonts();
			for (const font of fonts) parts.push(sha256Hex(font.data));
			return sha256Hex(parts.join('|')).slice(0, 16);
		} catch {
			// Fall back to the explicit version when the source can't be read
			// (e.g. a bundled build), rather than failing the run.
			return OG_DESIGN_VERSION;
		}
	})();
	return designFingerprintPromise;
}

/* -------------------------------------------------------------------------- */
/* Rendering                                                                  */
/* -------------------------------------------------------------------------- */

const RED = '#e51b15';
const INK = '#18181c';
const SLATE = '#5b5b62';
const FAINT = '#909099';

type El = { type: string; props: Record<string, unknown> };

function el(
	type: string,
	props: Record<string, unknown>,
	...children: Array<El | string | null | undefined>
): El {
	const kids = children.filter(
		(child): child is El | string => child !== null && child !== undefined
	);
	if (kids.length > 0) props.children = kids.length === 1 ? kids[0] : kids;
	return { type, props };
}

function formatPrice(value: number): string {
	return `${value.toLocaleString('fi-FI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

function formatPerLitre(value: number): string {
	return `${formatPrice(value)}/l`;
}

function formatVolume(value: number): string {
	return value.toLocaleString('fi-FI');
}

function formatAbv(value: number): string {
	return `${value.toLocaleString('fi-FI')} %`;
}

const fontWeights = [
	{ name: 'Inter', file: 'Inter_18pt-Regular.ttf', weight: 400, style: 'normal' },
	{ name: 'Inter', file: 'Inter_18pt-Medium.ttf', weight: 500, style: 'normal' },
	{ name: 'Inter', file: 'Inter_18pt-SemiBold.ttf', weight: 600, style: 'normal' },
	{ name: 'Inter', file: 'Inter_18pt-Bold.ttf', weight: 700, style: 'normal' },
	{ name: 'Inter', file: 'Inter_18pt-ExtraBold.ttf', weight: 800, style: 'normal' },
	{ name: 'Inter', file: 'Inter_18pt-Black.ttf', weight: 900, style: 'normal' }
] as const;

let fontsPromise: Promise<
	{ name: string; data: ArrayBuffer; weight: number; style: string }[]
> | null = null;

function loadFonts(): Promise<
	{ name: string; data: ArrayBuffer; weight: number; style: string }[]
> {
	fontsPromise ??= (async () =>
		Promise.all(
			fontWeights.map(async ({ name, file, weight, style }) => ({
				name,
				weight,
				style,
				data: await Bun.file(
					path.join(import.meta.dir, '..', '..', 'src/lib/assets/fonts/Inter/static', file)
				).arrayBuffer()
			}))
		))();
	return fontsPromise;
}

/**
 * Extracts the first (PNG) layer of `static/favicon.ico` so the exact site
 * favicon can be embedded into the OG image. Returns `undefined` when the file
 * is unavailable (e.g. a bare script test), in which case the caller falls back
 * to a plain monogram tile.
 */
function loadFavicon(): Promise<ArrayBuffer | undefined> {
	return (async () => {
		const file = path.join(import.meta.dir, '..', '..', 'static/favicon.ico');
		const data = await Bun.file(file).arrayBuffer();
		const bytes = new Uint8Array(data);
		const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
		let start = -1;
		for (let i = 0; i + signature.length <= bytes.length; i += 1) {
			let match = true;
			for (let j = 0; j < signature.length; j += 1) {
				if (bytes[i + j] !== signature[j]) {
					match = false;
					break;
				}
			}
			if (match) {
				start = i;
				break;
			}
		}
		if (start === -1 || start + 8 > bytes.length) return undefined;
		let end = -1;
		let position = start + 8;
		while (position + 12 <= bytes.length) {
			const length =
				(bytes[position] << 24) |
				(bytes[position + 1] << 16) |
				(bytes[position + 2] << 8) |
				bytes[position + 3];
			const type = String.fromCharCode(
				bytes[position + 4],
				bytes[position + 5],
				bytes[position + 6],
				bytes[position + 7]
			);
			if (type === 'IEND') {
				end = position + 12;
				break;
			}
			position += 12 + length;
		}
		if (end === -1) return undefined;
		return data.slice(start, end);
	})();
}

/** Renders the product showcase into a 1200x630 SVG using satori. */
export async function ogSvg(display: OgDisplay, image?: ArrayBuffer): Promise<string> {
	const [fonts, favicon] = await Promise.all([loadFonts(), loadFavicon()]);
	const priceLine = display.sale ? formatPrice(display.sale.salePrice) : formatPrice(display.price);
	const metaLine = [display.manufacturer, display.category, display.country]
		.filter(Boolean)
		.join(' · ');
	const specsLine = [
		display.volume ? `${formatVolume(display.volume)} l` : undefined,
		display.abv ? formatAbv(display.abv) : undefined
	]
		.filter(Boolean)
		.join(' · ');
	const subPrice =
		display.sale && display.sale.normalPrice > display.sale.salePrice
			? formatPrice(display.sale.normalPrice)
			: display.pricePerLitre
				? formatPerLitre(display.pricePerLitre)
				: undefined;

	const tree = el(
		'div',
		{
			style: {
				width: OG_IMAGE_WIDTH,
				height: OG_IMAGE_HEIGHT,
				display: 'flex',
				flexDirection: 'row',
				backgroundColor: '#ffffff',
				overflow: 'hidden',
				fontFamily: 'Inter'
			}
		},
		el('div', {
			style: {
				width: 24,
				height: '100%',
				flexShrink: 0,
				backgroundImage: `linear-gradient(to bottom, ${RED}, #7a0606)`
			}
		}),
		el(
			'div',
			{
				style: {
					flexGrow: 1,
					display: 'flex',
					flexDirection: 'row',
					alignItems: 'center',
					justifyContent: 'space-between',
					gap: 48,
					paddingLeft: 64,
					paddingRight: 72,
					paddingTop: 40,
					paddingBottom: 40
				}
			},
			el(
				'div',
				{ style: { width: 584, flexShrink: 1, display: 'flex', flexDirection: 'column', gap: 20 } },
				el(
					'div',
					{ style: { display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 12 } },
					favicon
						? el('img', {
								alt: '',
								width: 48,
								height: 48,
								src: favicon as ArrayBuffer,
								style: {
									width: 48,
									height: 48,
									borderRadius: 12,
									objectFit: 'cover'
								}
							})
						: el(
								'div',
								{
									style: {
										width: 40,
										height: 40,
										borderRadius: 12,
										backgroundColor: RED,
										display: 'flex',
										alignItems: 'center',
										justifyContent: 'center',
										fontSize: 26,
										fontWeight: 800,
										color: '#ffffff'
									}
								},
								'A'
							),
					el(
						'span',
						{ style: { fontSize: 26, fontWeight: 800, color: INK, letterSpacing: -0.5 } },
						'Alkometriikka'
					)
				),
				el(
					'div',
					{
						style: {
							display: '-webkit-box',
							WebkitBoxOrient: 'vertical',
							WebkitLineClamp: 3,
							overflow: 'hidden',
							wordBreak: 'break-word',
							fontSize: 58,
							fontWeight: 800,
							lineHeight: 1.08,
							letterSpacing: -1,
							color: INK
						}
					},
					display.name
				),
				metaLine
					? el(
							'span',
							{ style: { fontSize: 26, fontWeight: 600, color: SLATE, lineHeight: 1.3 } },
							metaLine
						)
					: null,
				el('div', { style: { height: 2, backgroundColor: '#ece9e3', width: 120 } }),
				specsLine
					? el(
							'span',
							{ style: { fontSize: 26, fontWeight: 500, color: FAINT, lineHeight: 1.3 } },
							specsLine
						)
					: null,
				el(
					'div',
					{ style: { display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 16 } },
					el(
						'span',
						{
							style: {
								fontSize: 66,
								fontWeight: 900,
								letterSpacing: -1.5,
								color: display.sale ? RED : INK
							}
						},
						priceLine
					),
					display.sale
						? el(
								'div',
								{
									style: {
										display: 'flex',
										alignItems: 'center',
										backgroundColor: RED,
										color: '#ffffff',
										fontSize: 24,
										fontWeight: 800,
										borderRadius: 999,
										padding: '8px 14px'
									}
								},
								`-${display.sale.discountPercent} %`
							)
						: null
				),
				el(
					'span',
					{
						style: {
							fontSize: 26,
							fontWeight: 500,
							color: FAINT,
							...(display.sale ? { textDecoration: 'line-through' } : {}),
							lineHeight: 1.2
						}
					},
					subPrice ?? '\u00a0'
				)
			),
			el(
				'div',
				{
					style: {
						width: 420,
						height: 550,
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center'
					}
				},
				el('img', {
					src: image as ArrayBuffer,
					width: 420,
					height: 550,
					style: {
						width: 420,
						height: 550,
						objectFit: 'contain'
					}
				})
			)
		)
	);

	return satori(tree as never, {
		width: OG_IMAGE_WIDTH,
		height: OG_IMAGE_HEIGHT,
		fonts: (await loadFonts()) as never
	});
}

export type DailyOgDisplay = {
	/** ISO `YYYY-MM-DD`, Europe/Helsinki. */
	date: string;
	/** 1-indexed count of Daily days published so far, including this one. */
	dayNumber: number;
};

function formatDailyDate(date: string): string {
	const formatted = new Intl.DateTimeFormat('fi-FI', {
		weekday: 'long',
		day: 'numeric',
		month: 'numeric',
		year: 'numeric'
	}).format(new Date(`${date}T12:00:00`));
	return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

/**
 * Renders the generic, non-personalized "today's Daily" share card into a
 * 1200x630 SVG using satori. Unlike {@link ogSvg}, this never varies per
 * player — it's the same image for everyone sharing that day, so it carries
 * no score or grid, only a teaser.
 */
export async function dailyOgSvg(display: DailyOgDisplay): Promise<string> {
	const [fonts, favicon] = await Promise.all([loadFonts(), loadFavicon()]);
	const gridBorder = '#c9c6c0';

	const emptyGrid = el(
		'div',
		{ style: { display: 'flex', flexDirection: 'row', gap: 14 } },
		...Array.from({ length: 7 }, () =>
			el('div', {
				style: { width: 56, height: 56, borderRadius: 10, border: `3px solid ${gridBorder}` }
			})
		)
	);

	const tree = el(
		'div',
		{
			style: {
				width: OG_IMAGE_WIDTH,
				height: OG_IMAGE_HEIGHT,
				display: 'flex',
				flexDirection: 'row',
				backgroundColor: '#ffffff',
				fontFamily: 'Inter'
			}
		},
		el('div', {
			style: {
				width: 24,
				height: '100%',
				flexShrink: 0,
				backgroundImage: `linear-gradient(to bottom, ${RED}, #7a0606)`
			}
		}),
		el(
			'div',
			{
				style: {
					flexGrow: 1,
					display: 'flex',
					flexDirection: 'column',
					justifyContent: 'center',
					gap: 28,
					paddingLeft: 72,
					paddingRight: 72
				}
			},
			el(
				'div',
				{
					style: {
						display: 'flex',
						flexDirection: 'row',
						alignItems: 'center',
						justifyContent: 'space-between'
					}
				},
				el(
					'div',
					{ style: { display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 14 } },
					favicon
						? el('img', {
								alt: '',
								width: 52,
								height: 52,
								src: favicon as ArrayBuffer,
								style: { width: 52, height: 52, borderRadius: 13, objectFit: 'cover' }
							})
						: el(
								'div',
								{
									style: {
										width: 44,
										height: 44,
										borderRadius: 13,
										backgroundColor: RED,
										display: 'flex',
										alignItems: 'center',
										justifyContent: 'center',
										fontSize: 28,
										fontWeight: 800,
										color: '#ffffff'
									}
								},
								'A'
							),
					el(
						'span',
						{ style: { fontSize: 30, fontWeight: 800, color: INK, letterSpacing: -0.5 } },
						'Alkometriikka Daily'
					)
				),
				el(
					'div',
					{
						style: {
							display: 'flex',
							alignItems: 'center',
							backgroundColor: '#f4f1ec',
							color: SLATE,
							fontSize: 24,
							fontWeight: 700,
							borderRadius: 999,
							padding: '10px 20px'
						}
					},
					`#${display.dayNumber}`
				)
			),
			el(
				'span',
				{ style: { fontSize: 60, fontWeight: 900, letterSpacing: -1.5, color: INK } },
				formatDailyDate(display.date)
			),
			el(
				'span',
				{ style: { fontSize: 30, fontWeight: 500, color: SLATE, lineHeight: 1.35, maxWidth: 820 } },
				'Seitsemän kysymystä Alkon valikoimasta. Testaa Alko(holi)tuntemuksesi!'
			),
			el(
				'div',
				{
					style: {
						display: 'flex',
						flexDirection: 'row',
						alignItems: 'center',
						gap: 28,
						marginTop: 8
					}
				},
				emptyGrid,
				el(
					'div',
					{
						style: {
							display: 'flex',
							alignItems: 'center',
							backgroundColor: RED,
							color: '#ffffff',
							fontSize: 24,
							fontWeight: 800,
							borderRadius: 999,
							padding: '14px 28px'
						}
					},
					'Pelaa nyt →'
				)
			)
		)
	);

	return satori(tree as never, {
		width: OG_IMAGE_WIDTH,
		height: OG_IMAGE_HEIGHT,
		fonts: fonts as never
	});
}

/** Rasterizes an satori SVG into a PNG buffer. */
export function svgToPng(svg: string): Uint8Array {
	const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: OG_IMAGE_WIDTH } });
	return resvg.render().asPng();
}

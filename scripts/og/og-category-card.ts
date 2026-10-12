import { CryptoHasher } from 'bun';
import path from 'node:path';
import satori from 'satori';
import {
	buildCategoryTree,
	CATEGORY_BASE_PATH,
	categorySlug,
	type CategoryNode
} from '../../src/lib/utils/categories';
import {
	el,
	INK,
	loadFavicon,
	loadFonts,
	OG_IMAGE_HEIGHT,
	OG_IMAGE_WIDTH,
	ogImageUrl,
	RED,
	SLATE,
	type El
} from './og';

/**
 * The category page OG cards, deliberately kept out of og.ts: that file's
 * whole source is hashed into every PRODUCT image's key (`ogDesignFingerprint`),
 * so editing it would re-render the entire catalog. This file only imports the
 * shared helpers. Category cards have their own key prefix, manifest
 * (`og-categories.json`) and design fingerprint (this file's source + the
 * favicon + fonts), so changing them never touches the product images.
 */

export const CATEGORY_OG_KEY_PREFIX = 'categories';
export const CATEGORY_OG_MANIFEST_FILE = 'og-categories.json';
const CATEGORY_OG_HASH_LENGTH = 12;
/** Escape hatch to re-render every category card without touching the code. */
const CATEGORY_OG_DESIGN_VERSION = process.env.CATEGORY_OG_DESIGN_VERSION || '1';

/** Page path (`/kategoriat/viinit/`) → object key (`categories/viinit-ab12cd34ef56.png`). */
export type CategoryOgManifest = Record<string, string>;

export type CategoryOgDisplay = {
	/** Site path of the page, e.g. `/kategoriat/viinit/punaviinit/`. */
	path: string;
	/** "Kategoriat" on the index, else the category's name. */
	name: string;
	/** The Tyyppi of a subtype page. */
	parent?: string;
	/** Active products in the category. */
	count: number;
	medianPricePerLiter?: number;
	medianPrice?: number;
	/** The largest subcategories (or top-level types on the index), for the chip row. */
	children: string[];
};

const MAX_CHILDREN = 5;

type StoredProduct = { values?: unknown[]; meta?: { removedFromSelection?: unknown } };

function asNumber(value: unknown): number | undefined {
	const number = typeof value === 'string' ? Number(value.replace(',', '.')) : value;
	return typeof number === 'number' && Number.isFinite(number) && number > 0 ? number : undefined;
}

export function median(values: number[]): number | undefined {
	if (values.length === 0) return undefined;
	const sorted = [...values].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Rounded to cents so float noise can't change the key. */
function cents(value: number | undefined): number | undefined {
	return value === undefined ? undefined : Math.round(value * 100) / 100;
}

/**
 * One card per prerendered category page (the same tree the prerender and
 * sitemap use), plus the `/kategoriat/` index.
 */
export function categoryOgDisplays(
	schema: readonly string[],
	products: Iterable<StoredProduct>
): CategoryOgDisplay[] {
	const typeIndex = schema.indexOf('Tyyppi');
	const subTypeIndex = schema.indexOf('Alatyyppi');
	const priceIndex = schema.indexOf('Hinta');
	const perLiterIndex = schema.indexOf('Litrahinta');

	const active: { typeSlug: string; subTypeSlug: string; price?: number; perLiter?: number }[] = [];
	const entries: { type: unknown; subType: unknown; removed: boolean }[] = [];
	for (const product of products) {
		if (!product || !Array.isArray(product.values)) continue;
		const removed = Boolean(product.meta?.removedFromSelection);
		const type = product.values[typeIndex];
		const subType = product.values[subTypeIndex];
		entries.push({ type, subType, removed });
		if (removed) continue;
		active.push({
			typeSlug: categorySlug(String(type ?? '')),
			subTypeSlug: categorySlug(String(subType ?? '')),
			price: asNumber(product.values[priceIndex]),
			perLiter: asNumber(product.values[perLiterIndex])
		});
	}
	const tree = buildCategoryTree(entries);

	const display = (
		pagePath: string,
		name: string,
		count: number,
		items: typeof active,
		children: CategoryNode[],
		parent?: string
	): CategoryOgDisplay => ({
		path: pagePath,
		name,
		...(parent ? { parent } : {}),
		count,
		medianPricePerLiter: cents(
			median(items.flatMap((item) => (item.perLiter ? [item.perLiter] : [])))
		),
		medianPrice: cents(median(items.flatMap((item) => (item.price ? [item.price] : [])))),
		children: children.slice(0, MAX_CHILDREN).map((child) => child.name)
	});

	const displays = [
		display(
			`${CATEGORY_BASE_PATH}/`,
			'Kategoriat',
			tree.reduce((sum, type) => sum + type.count, 0),
			active,
			tree
		)
	];
	for (const type of tree) {
		const inType = active.filter((item) => item.typeSlug === type.slug);
		displays.push(display(type.path, type.name, type.count, inType, type.children));
		for (const subType of type.children) {
			const inSubType = inType.filter((item) => item.subTypeSlug === subType.slug);
			displays.push(display(subType.path, subType.name, subType.count, inSubType, [], type.name));
		}
	}
	return displays;
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
 * Fingerprint of the card's layout: this file's normalized source, the favicon
 * and the fonts. A layout change re-keys (and so re-renders) only the category
 * cards. og.ts isn't part of it: its shared helpers are layout-neutral.
 */
export function categoryOgDesignFingerprint(): Promise<string> {
	designFingerprintPromise ??= (async () => {
		try {
			const parts: string[] = [CATEGORY_OG_DESIGN_VERSION];
			parts.push(
				sha256Hex(
					normalizeSource(await Bun.file(path.join(import.meta.dir, 'og-category-card.ts')).text())
				)
			);
			const favicon = await loadFavicon();
			if (favicon) parts.push(sha256Hex(favicon));
			for (const font of await loadFonts()) parts.push(sha256Hex(font.data));
			return sha256Hex(parts.join('|')).slice(0, 16);
		} catch {
			return CATEGORY_OG_DESIGN_VERSION;
		}
	})();
	return designFingerprintPromise;
}

/** `/kategoriat/viinit/punaviinit/` → `viinit--punaviinit`, the index → `index`. */
function pageSlug(pagePath: string): string {
	const parts = pagePath.slice(CATEGORY_BASE_PATH.length).split('/').filter(Boolean);
	return parts.length ? parts.join('--') : 'index';
}

/** Content-addressed key, e.g. `categories/viinit--punaviinit-ab12cd34ef56.png`. */
export function categoryOgKey(display: CategoryOgDisplay, design: string): string {
	const hash = sha256Hex(JSON.stringify({ design, display })).slice(0, CATEGORY_OG_HASH_LENGTH);
	return `${CATEGORY_OG_KEY_PREFIX}/${pageSlug(display.path)}-${hash}.png`;
}

export function categoryOgUrl(key: string): string {
	return ogImageUrl(key);
}

/* -------------------------------------------------------------------------- */
/* Rendering                                                                  */
/* -------------------------------------------------------------------------- */

const FAINT = '#909099';
const TILE = '#f4f1ec';

function formatEuro(value: number): string {
	return `${value.toLocaleString('fi-FI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

/** Width left for content between the red edge and the paddings. */
const CONTENT_WIDTH = OG_IMAGE_WIDTH - 24 - 64 - 72;
const STAT_GAP = 20;

function stat(label: string, value: string, width: number): El {
	return el(
		'div',
		{
			style: {
				display: 'flex',
				flexDirection: 'column',
				gap: 6,
				backgroundColor: TILE,
				borderRadius: 18,
				padding: '20px 26px',
				width,
				flexShrink: 0
			}
		},
		el('span', { style: { fontSize: 22, fontWeight: 600, color: SLATE } }, label),
		el('span', { style: { fontSize: 44, fontWeight: 900, letterSpacing: -1, color: INK } }, value)
	);
}

/** Renders a category card into a 1200x630 SVG using satori. */
export async function categoryOgSvg(display: CategoryOgDisplay): Promise<string> {
	const [fonts, favicon] = await Promise.all([loadFonts(), loadFavicon()]);
	const isIndex = display.path === `${CATEGORY_BASE_PATH}/`;
	const eyebrow = isIndex
		? 'Alkon valikoima'
		: display.parent
			? `Kategoriat › ${display.parent}`
			: 'Kategoriat';
	const nameSize = display.name.length > 22 ? 64 : 84;

	const values: [string, string][] = [
		[isIndex ? 'Tuotteita valikoimassa' : 'Tuotteita', display.count.toLocaleString('fi-FI')]
	];
	if (display.medianPricePerLiter !== undefined)
		values.push(['Litrahinnan mediaani', `${formatEuro(display.medianPricePerLiter)}/l`]);
	if (display.medianPrice !== undefined)
		values.push(['Hinnan mediaani', formatEuro(display.medianPrice)]);
	const statWidth = Math.floor((CONTENT_WIDTH - STAT_GAP * (values.length - 1)) / values.length);
	const stats = values.map(([label, value]) => stat(label, value, statWidth));

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
					flexDirection: 'column',
					justifyContent: 'space-between',
					padding: '52px 72px 56px 64px'
				}
			},
			el(
				'div',
				{ style: { display: 'flex', flexDirection: 'column', gap: 18 } },
				el(
					'div',
					{ style: { display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 12 } },
					favicon
						? el('img', {
								alt: '',
								width: 48,
								height: 48,
								src: favicon as ArrayBuffer,
								style: { width: 48, height: 48, borderRadius: 12, objectFit: 'cover' }
							})
						: null,
					el(
						'span',
						{ style: { fontSize: 26, fontWeight: 800, color: INK, letterSpacing: -0.5 } },
						'Alkometriikka'
					)
				),
				el(
					'span',
					{ style: { fontSize: 28, fontWeight: 600, color: FAINT, marginTop: 14 } },
					eyebrow
				),
				el(
					'div',
					{
						style: {
							display: '-webkit-box',
							WebkitBoxOrient: 'vertical',
							WebkitLineClamp: 2,
							overflow: 'hidden',
							wordBreak: 'break-word',
							fontSize: nameSize,
							fontWeight: 900,
							lineHeight: 1.05,
							letterSpacing: -2,
							color: INK
						}
					},
					display.name
				),
				display.children.length
					? el(
							'div',
							{
								style: {
									display: 'flex',
									flexDirection: 'row',
									flexWrap: 'wrap',
									gap: 10,
									height: 46,
									overflow: 'hidden'
								}
							},
							...display.children.map((child) =>
								el(
									'span',
									{
										style: {
											display: 'flex',
											fontSize: 22,
											fontWeight: 600,
											color: SLATE,
											border: '2px solid #ece9e3',
											borderRadius: 999,
											padding: '6px 16px'
										}
									},
									child
								)
							)
						)
					: null
			),
			el('div', { style: { display: 'flex', flexDirection: 'row', gap: STAT_GAP } }, ...stats)
		)
	);

	return satori(tree as never, {
		width: OG_IMAGE_WIDTH,
		height: OG_IMAGE_HEIGHT,
		fonts: fonts as never
	});
}

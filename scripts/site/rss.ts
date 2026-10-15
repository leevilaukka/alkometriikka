import Bun from 'bun';
import { mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import type { MigratedData } from '../data/types';
import { DEV } from '../data/constants';
import { ogImageUrl } from '../og/og';
import type { StoredProduct } from '../../src/lib/utils/catalog/dataset';
import {
	buildCategoryTree,
	categoryFeedPath,
	categoryPath,
	categorySlug,
	categoryTitle,
	CATEGORY_FEED_DIR
} from '../../src/lib/utils/catalog/categories';
import { m } from '../../src/lib/paraglide/messages.js';
import { FINNISH, INTL_TAGS, loadTranslator, type Translator } from '../i18n/translate';

/** Max items in the aggregate (whole-catalog) feed. */
const RSS_LIMIT = 1000;
/** Max items in each per-product feed. */
const PER_PRODUCT_LIMIT = 20;
/** Max items in each per-category feed. */
const PER_CATEGORY_LIMIT = 50;
const SITE_URL = 'https://alkometriikka.fi';
const RSS_AGGREGATE_PATH = 'rss.xml';
const RSS_DIR = 'rss';
const FEED_AGGREGATE_PATH = 'feed.json';
/**
 * Languages the aggregate feeds are also published in, as `rss.<language>.xml` and
 * `feed.<language>.json`. Per-product and per-category feeds are Finnish only.
 */
const FEED_LANGUAGES = ['en', 'sv'] as const;
const translatedPath = (path: string, language: string) =>
	path.replace(/\.(\w+)$/, `.${language}.$1`);

type FeedItem = {
	guid: string;
	title: string;
	link: string;
	date: string;
	pubDate: string;
	description: string;
	image: string | null;
	name: string;
	category: string;
	/** Slugs of the product's Tyyppi and Alatyyppi, for the per-category feeds. */
	typeSlug: string;
	subTypeSlug: string;
	tags: string[];
};

function escapeXml(value: unknown): string {
	return String(value ?? '')
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&apos;');
}

function asText(value: unknown): string {
	if (Array.isArray(value))
		return value
			.map((item) => String(item).trim())
			.filter(Boolean)
			.join(', ');
	return value === null || value === undefined ? '' : String(value).trim();
}

function formatPrice(value: number, t: Translator = FINNISH): string {
	return value.toLocaleString(INTL_TAGS[t.language], {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2
	});
}

function formatVolume(value: number, t: Translator): string {
	return `${value.toLocaleString(INTL_TAGS[t.language], { maximumFractionDigits: 2 })} l`;
}

function formatPercentage(value: number, t: Translator): string {
	return value.toLocaleString(INTL_TAGS[t.language], {
		minimumFractionDigits: 1,
		maximumFractionDigits: 2
	});
}

/** English writes "12%", Finnish and Swedish "12 %". */
function percentSign(t: Translator): string {
	return t.language === 'en' ? '%' : ' %';
}

function asNumber(value: unknown): number | undefined {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string') {
		const parsed = Number(value.replace(',', '.').replace(/\s/g, '').trim());
		if (Number.isFinite(parsed)) return parsed;
	}
	return undefined;
}

function formatSigned(value: number, suffix: string, t: Translator): string {
	return `${value > 0 ? '+' : ''}${formatPrice(value, t)} ${suffix}`;
}

function compareItemsByDate(a: FeedItem, b: FeedItem): number {
	return b.date.localeCompare(a.date) || a.guid.localeCompare(b.guid);
}

/** RFC 822 date (as RSS 2.0 requires) from a YYYY-MM-DD price-history date. */
function toRfc822Date(date: string): string {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return new Date().toUTCString();
	return new Date(`${date}T12:00:00Z`).toUTCString();
}

/** ISO 8601 date (as JSON Feed requires) from a YYYY-MM-DD price-history date. */
function toIsoDate(date: string): string {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return new Date().toISOString();
	return `${date}T12:00:00Z`;
}

/** Strips the HTML out of a feed description for the JSON Feed summary field. */
function stripHtml(html: string): string {
	return html
		.replace(/<br\s*\/?>/gi, ' ')
		.replace(/<[^>]+>/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function alkoImageUrl(productId: string): string {
	return `https://images.alko.fi/images/cs_srgb,f_auto,t_products/cdn/${encodeURIComponent(productId)}/kuva.jpg`;
}

/**
 * One feed item per price change between consecutive price-history points,
 * grouped by product id (chronological within each product). Products without
 * a single recorded change are omitted entirely.
 */
function collectPerProductItems(
	schema: string[],
	products: Record<string, StoredProduct>,
	ogManifest: Record<string, string>,
	t: Translator = FINNISH
): Map<string, FeedItem[]> {
	const locale = t.language;
	const byProduct = new Map<string, FeedItem[]>();
	for (const [productId, product] of Object.entries(products)) {
		if (!product || !Array.isArray(product.values)) continue;
		const history = Array.isArray(product.priceHistory) ? product.priceHistory : [];
		if (history.length < 2) continue;

		const fields = Object.fromEntries(
			schema.map((column, index) => [column, product.values[index]])
		);
		const id = asText(fields.Numero);
		const name = t.name(id, asText(fields.Nimi)) || m.feed_product_fallback({ id }, { locale });
		if (!id || id !== productId) continue;

		const image = ogManifest[productId] ? ogImageUrl(ogManifest[productId]) : alkoImageUrl(id);
		const link = `${SITE_URL}/tuotteet/${encodeURIComponent(id)}/`;
		const category = [asText(fields.Tyyppi), asText(fields.Alatyyppi)]
			.filter(Boolean)
			.map(t.value)
			.join(' / ');

		const items: FeedItem[] = [];
		for (let index = 1; index < history.length; index += 1) {
			const previous = history[index - 1];
			const current = history[index];
			if (!previous || !current || previous.price === current.price) continue;

			const delta = current.price - previous.price;
			const percent = previous.price !== 0 ? (delta / previous.price) * 100 : 0;
			const signedPercent = `${percent > 0 ? '+' : ''}${percent.toLocaleString(INTL_TAGS[locale], {
				minimumFractionDigits: 2,
				maximumFractionDigits: 2
			})}${percentSign(t)}`;
			const from = `${formatPrice(previous.price, t)} €`;
			const to = `${formatPrice(current.price, t)} €`;

			items.push({
				guid: `alkometriikka-${id}-${current.date}-${current.price}`,
				title: `${name} — ${from} → ${to}`,
				link,
				date: current.date,
				pubDate: toRfc822Date(current.date),
				description: `<p>${m.feed_price_changed({ name }, { locale })}</p><p>${from} → ${to} (${formatSigned(delta, '€', t)}, ${signedPercent}).</p>`,
				image,
				name,
				category,
				typeSlug: categorySlug(asText(fields.Tyyppi)),
				subTypeSlug: categorySlug(asText(fields.Alatyyppi)),
				tags: []
			});
		}
		if (items.length > 0) byProduct.set(productId, items);
	}
	return byProduct;
}

/**
 * One feed item per product currently flagged as a novelty ("Uutuus") in the
 * dataset. Each item's date is the product's first recorded price observation,
 * which approximates when it appeared in Alko's selection.
 */
function collectNewProductItems(
	schema: string[],
	products: Record<string, StoredProduct>,
	ogManifest: Record<string, string>,
	t: Translator = FINNISH
): FeedItem[] {
	const locale = t.language;
	const items: FeedItem[] = [];
	for (const [productId, product] of Object.entries(products)) {
		if (!product || !Array.isArray(product.values)) continue;

		const fields = Object.fromEntries(
			schema.map((column, index) => [column, product.values[index]])
		);
		if (asText(fields.Uutuus).toLowerCase() !== 'uutuus') continue;

		const id = asText(fields.Numero);
		const name = t.name(id, asText(fields.Nimi)) || m.feed_product_fallback({ id }, { locale });
		if (!id || id !== productId) continue;

		const history = Array.isArray(product.priceHistory) ? product.priceHistory : [];
		const date = history[0]?.date;
		if (!date) continue;

		const manufacturer = asText(fields.Valmistaja);
		const country = t.value(asText(fields.Valmistusmaa));
		const price = asNumber(fields.Hinta);
		const volume = asNumber(fields.Pullokoko);
		const abv = asNumber(fields['Alkoholi-%']);
		const category = [asText(fields.Tyyppi), asText(fields.Alatyyppi)]
			.filter(Boolean)
			.map(t.value)
			.join(' / ');

		const details: string[] = [];
		if (manufacturer) details.push(`${m.column_manufacturer({}, { locale })}: ${manufacturer}`);
		if (country) details.push(`${m.column_country({}, { locale })}: ${country}`);
		if (price !== undefined)
			details.push(`${m.column_price({}, { locale })}: ${formatPrice(price, t)} €`);
		if (volume !== undefined)
			details.push(`${m.feed_volume({}, { locale })}: ${formatVolume(volume, t)}`);
		if (abv !== undefined)
			details.push(
				`${m.column_alcohol_percentage({}, { locale })}: ${formatPercentage(abv, t)}${percentSign(t)}`
			);

		items.push({
			guid: `alkometriikka-new-${id}`,
			title: name,
			link: `${SITE_URL}/tuotteet/${encodeURIComponent(id)}/`,
			date,
			pubDate: toRfc822Date(date),
			description:
				`<p>${m.feed_new_product({ name }, { locale })}</p>` +
				(details.length > 0 ? `<p>${details.join('<br />')}</p>` : ''),
			image: ogManifest[productId] ? ogImageUrl(ogManifest[productId]) : alkoImageUrl(id),
			name,
			category,
			typeSlug: categorySlug(asText(fields.Tyyppi)),
			subTypeSlug: categorySlug(asText(fields.Alatyyppi)),
			tags: [m.value_new({}, { locale })]
		});
	}
	return items;
}

type ChannelInfo = {
	title: string;
	description: string;
	link: string;
	selfUrl: string;
};

function generateRssXml(
	items: FeedItem[],
	channel: ChannelInfo,
	lastBuildDateISO?: string,
	language = 'fi'
): string {
	const itemsXml = items
		.map(
			(item) =>
				`<item>` +
				`<title>${escapeXml(item.title)}</title>` +
				`<link>${escapeXml(item.link)}</link>` +
				`<guid isPermaLink="false">${escapeXml(item.guid)}</guid>` +
				`<pubDate>${escapeXml(item.pubDate)}</pubDate>` +
				[...item.tags, item.category]
					.filter(Boolean)
					.map((category) => `<category>${escapeXml(category)}</category>`)
					.join('') +
				`<description><![CDATA[${item.description}]]></description>` +
				(item.image ? `<media:thumbnail url="${escapeXml(item.image)}" />` : '') +
				`</item>`
		)
		.join('');

	const lastBuildDate = lastBuildDateISO
		? toRfc822Date(lastBuildDateISO.slice(0, 10))
		: new Date().toUTCString();

	return (
		`<?xml version="1.0" encoding="UTF-8"?>` +
		`<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/" xmlns:atom="http://www.w3.org/2005/Atom">` +
		`<channel>` +
		`<title>${escapeXml(channel.title)}</title>` +
		`<link>${escapeXml(channel.link)}</link>` +
		`<description>${escapeXml(channel.description)}</description>` +
		`<language>${language}</language>` +
		`<lastBuildDate>${lastBuildDate}</lastBuildDate>` +
		`<generator>alkometriikka rss.ts</generator>` +
		`<docs>https://www.rssboard.org/rss-specification</docs>` +
		`<ttl>60</ttl>` +
		`<atom:link href="${escapeXml(channel.selfUrl)}" rel="self" type="application/rss+xml" />` +
		`<image>` +
		`<url>${SITE_URL}/favicon.ico</url>` +
		`<title>${escapeXml(channel.title)}</title>` +
		`<link>${SITE_URL}/</link>` +
		`<width>48</width>` +
		`<height>48</height>` +
		`</image>` +
		itemsXml +
		`</channel>` +
		`</rss>`
	);
}

/** Serializes feed items to the JSON Feed 1.1 format (https://jsonfeed.org). */
function generateJsonFeed(items: FeedItem[], channel: ChannelInfo, language = 'fi'): string {
	return JSON.stringify({
		version: 'https://jsonfeed.org/version/1.1',
		title: channel.title,
		home_page_url: channel.link,
		feed_url: channel.selfUrl,
		description: channel.description,
		language,
		favicon: `${SITE_URL}/favicon.ico`,
		items: items.map((item) => {
			const entry: Record<string, string | string[]> = {
				id: item.guid,
				url: item.link,
				title: item.title,
				content_html: item.description,
				summary: stripHtml(item.description),
				date_published: toIsoDate(item.date)
			};
			if (item.image) entry.image = item.image;
			// Split the hierarchical "Tyyppi / Alatyyppi" category into flat tags,
			// prefixed with any item tags ("Uutuus" for new products).
			entry.tags = [...item.tags, ...item.category.split(' / ')].filter(Boolean);
			return entry;
		})
	});
}

async function writePerProductFeeds(
	byProduct: Map<string, FeedItem[]>,
	lastBuildDateISO: string | undefined
): Promise<number> {
	await mkdir(RSS_DIR, { recursive: true });
	const writtenIds = new Set<string>();
	for (const [productId, items] of byProduct) {
		const feed = [...items].sort(compareItemsByDate).slice(0, PER_PRODUCT_LIMIT);
		const name = feed[0]?.name ?? productId;
		const channel: ChannelInfo = {
			title: `Alkometriikka – ${name} – hintamuutokset`,
			description: `Uusimmat hinnanmuutokset tuotteelle: ${name}.`,
			link: feed[0]?.link ?? `${SITE_URL}/tuotteet/${encodeURIComponent(productId)}/`,
			selfUrl: `${SITE_URL}/rss/${encodeURIComponent(productId)}.xml`
		};
		await Bun.write(
			path.join(RSS_DIR, `${productId}.xml`),
			generateRssXml(feed, channel, lastBuildDateISO)
		);
		writtenIds.add(productId);
	}

	// Prune stale per-product feeds for products that dropped out of the
	// dataset, so an old feed never lingers on the deployed site.
	const expected = new Set([...writtenIds].map((id) => `${id}.xml`));
	let existing: string[] = [];
	try {
		existing = await readdir(RSS_DIR);
	} catch {
		existing = [];
	}
	for (const entry of existing) {
		// Category feeds live in their own subdirectory, regenerated by writeCategoryFeeds
		if (`${RSS_DIR}/${entry}` === CATEGORY_FEED_DIR) continue;
		if (!expected.has(entry)) {
			await rm(path.join(RSS_DIR, entry), { force: true });
		}
	}
	return writtenIds.size;
}

/**
 * One feed per category page (Tyyppi and Tyyppi › Alatyyppi) with the newest
 * products and price changes in it. Fully regenerated every run.
 */
async function writeCategoryFeeds(
	schema: string[],
	products: Record<string, StoredProduct>,
	items: FeedItem[],
	lastBuildDateISO: string | undefined
): Promise<number> {
	const typeIndex = schema.indexOf('Tyyppi');
	const subTypeIndex = schema.indexOf('Alatyyppi');
	const tree = buildCategoryTree(
		Object.values(products)
			.filter((product) => product && Array.isArray(product.values))
			.map((product) => ({
				type: product.values[typeIndex],
				subType: product.values[subTypeIndex],
				removed: Boolean(product.meta?.removedFromSelection)
			}))
	);

	await rm(CATEGORY_FEED_DIR, { recursive: true, force: true });
	let count = 0;
	for (const type of tree) {
		for (const trail of [[type], ...type.children.map((subType) => [type, subType])]) {
			const [typeNode, subTypeNode] = trail;
			const feed = items
				.filter(
					(item) =>
						item.typeSlug === typeNode.slug &&
						(!subTypeNode || item.subTypeSlug === subTypeNode.slug)
				)
				.slice(0, PER_CATEGORY_LIMIT);
			if (feed.length === 0) continue;

			const feedPath = categoryFeedPath(typeNode.slug, subTypeNode?.slug);
			const name = categoryTitle(trail);
			const channel: ChannelInfo = {
				title: `Alkometriikka – ${name} – uutuudet ja hintamuutokset`,
				description: `Uusimmat uutuudet ja hinnanmuutokset kategoriassa ${name}.`,
				link: `${SITE_URL}${categoryPath(typeNode.slug, subTypeNode?.slug)}`,
				selfUrl: `${SITE_URL}${feedPath}.xml`
			};
			// RSS only: a JSON Feed per category would double the size for little use
			await mkdir(path.dirname(`.${feedPath}`), { recursive: true });
			await Bun.write(`.${feedPath}.xml`, generateRssXml(feed, channel, lastBuildDateISO));
			count += 1;
		}
	}
	return count;
}

/**
 * Reserves a slot for every currently-new product so the "uutuudet" section is never crowded
 * out of the aggregate by price changes, then fills the remaining slots with the most recent
 * price changes and sorts the whole mix by date.
 */
function aggregateItems(newItems: FeedItem[], priceChanges: FeedItem[]): FeedItem[] {
	const priceLimit = Math.max(0, RSS_LIMIT - newItems.length);
	return [...newItems, ...priceChanges.slice(0, priceLimit)].sort(compareItemsByDate);
}

/** `rss.xml` and `feed.json`, or `rss.<language>.xml` and `feed.<language>.json`. */
async function writeAggregateFeeds(
	items: FeedItem[],
	t: Translator,
	lastBuildDateISO: string | undefined
) {
	const { language } = t;
	const rssPath =
		language === 'fi' ? RSS_AGGREGATE_PATH : translatedPath(RSS_AGGREGATE_PATH, language);
	const jsonPath =
		language === 'fi' ? FEED_AGGREGATE_PATH : translatedPath(FEED_AGGREGATE_PATH, language);
	const channel: ChannelInfo = {
		title: m.feed_channel_title({}, { locale: language }),
		description: m.feed_channel_description({}, { locale: language }),
		link: `${SITE_URL}/`,
		selfUrl: `${SITE_URL}/${rssPath}`
	};
	await Promise.all([
		Bun.write(rssPath, generateRssXml(items, channel, lastBuildDateISO, language)),
		Bun.write(
			jsonPath,
			generateJsonFeed(items, { ...channel, selfUrl: `${SITE_URL}/${jsonPath}` }, language)
		)
	]);
}

async function main() {
	const dataFile = Bun.file(DEV ? './static/data.json' : './data.json');
	const ogManifestFile = Bun.file(DEV ? './static/og-images.json' : './og-images.json');

	const [{ schema, metadata, products }, ogManifest] = (await Promise.all([
		dataFile.json(),
		ogManifestFile
			.json()
			.then((value) => value as Record<string, string>)
			.catch(() => ({}) as Record<string, string>)
	])) as [MigratedData, Record<string, string>];

	if (!Array.isArray(schema) || !schema.every((column) => typeof column === 'string')) {
		throw new Error(`Invalid schema in ${dataFile.name}`);
	}
	if (!products || typeof products !== 'object') {
		throw new Error(`No products found in ${dataFile.name}`);
	}

	const byProduct = collectPerProductItems(schema, products, ogManifest);
	const newItems = [...collectNewProductItems(schema, products, ogManifest)].sort(
		compareItemsByDate
	);
	const priceChanges = [...byProduct.values()].flat().sort(compareItemsByDate);
	const lastBuildDateISO = metadata?.LastUpdated;

	const aggregate = aggregateItems(newItems, priceChanges);
	await writeAggregateFeeds(aggregate, FINNISH, lastBuildDateISO);

	// The same feeds in the other languages, from the value translations the sync wrote
	for (const language of FEED_LANGUAGES) {
		const labelsPath = translatedPath(DEV ? './static/labels.json' : './labels.json', language);
		const t = await loadTranslator(language, labelsPath);
		if (!t) {
			console.warn(`RSS: ${labelsPath} missing, skipping the ${language} feeds`);
			continue;
		}
		const translatedChanges = [...collectPerProductItems(schema, products, ogManifest, t).values()]
			.flat()
			.sort(compareItemsByDate);
		const translatedNew = collectNewProductItems(schema, products, ogManifest, t).sort(
			compareItemsByDate
		);
		await writeAggregateFeeds(
			aggregateItems(translatedNew, translatedChanges),
			t,
			lastBuildDateISO
		);
	}

	const productFeedCount = await writePerProductFeeds(byProduct, lastBuildDateISO);
	const categoryFeedCount = await writeCategoryFeeds(
		schema,
		products,
		[...newItems, ...priceChanges].sort(compareItemsByDate),
		lastBuildDateISO
	);
	const totalChanges = [...byProduct.values()].reduce((sum, items) => sum + items.length, 0);

	console.log(
		`RSS: aggregate ${aggregate.length} of ${totalChanges} price changes + ${newItems.length} new products → ${RSS_AGGREGATE_PATH}+${FEED_AGGREGATE_PATH}; ` +
			`${productFeedCount} per-product feeds (xml) → ${RSS_DIR}/; ` +
			`${categoryFeedCount} per-category feeds (xml) → ${CATEGORY_FEED_DIR}/`
	);
}

await main();

export {};

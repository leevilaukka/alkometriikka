import Bun from 'bun';
import { mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { MigratedData } from './setup/types';
import { DEV } from './setup/constants';
import { ogImageUrl } from './og';

/** Max items in the aggregate (whole-catalog) feed. */
const RSS_LIMIT = 1000;
/** Max items in each per-product feed. */
const PER_PRODUCT_LIMIT = 20;
const SITE_URL = 'https://alkometriikka.fi';
const RSS_AGGREGATE_PATH = 'rss.xml';
const RSS_DIR = 'rss';
const FEED_AGGREGATE_PATH = 'feed.json';

type PricePoint = { date: string; price: number };

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
};

type ProductRecord = {
	values: unknown[];
	priceHistory?: PricePoint[];
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

function formatPrice(value: number): string {
	return value.toLocaleString('fi-FI', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatVolume(value: number): string {
	return `${value.toLocaleString('fi-FI', { maximumFractionDigits: 2 })} l`;
}

function formatPercentage(value: number): string {
	return value.toLocaleString('fi-FI', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
}

function asNumber(value: unknown): number | undefined {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string') {
		const parsed = Number(value.replace(',', '.').replace(/\s/g, '').trim());
		if (Number.isFinite(parsed)) return parsed;
	}
	return undefined;
}

function formatSigned(value: number, suffix: string): string {
	return `${value > 0 ? '+' : ''}${formatPrice(value)} ${suffix}`;
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
	products: Record<string, ProductRecord>,
	ogManifest: Record<string, string>
): Map<string, FeedItem[]> {
	const byProduct = new Map<string, FeedItem[]>();
	for (const [productId, product] of Object.entries(products)) {
		if (!product || !Array.isArray(product.values)) continue;
		const history = Array.isArray(product.priceHistory) ? product.priceHistory : [];
		if (history.length < 2) continue;

		const fields = Object.fromEntries(
			schema.map((column, index) => [column, product.values[index]])
		);
		const id = asText(fields.Numero);
		const name = asText(fields.Nimi) || `Tuote ${id}`;
		if (!id || id !== productId) continue;

		const image = ogManifest[productId] ? ogImageUrl(ogManifest[productId]) : alkoImageUrl(id);
		const link = `${SITE_URL}/tuotteet/${encodeURIComponent(id)}/`;
		const category = [asText(fields.Tyyppi), asText(fields.Alatyyppi)].filter(Boolean).join(' / ');

		const items: FeedItem[] = [];
		for (let index = 1; index < history.length; index += 1) {
			const previous = history[index - 1];
			const current = history[index];
			if (!previous || !current || previous.price === current.price) continue;

			const delta = current.price - previous.price;
			const percent = previous.price !== 0 ? (delta / previous.price) * 100 : 0;
			const signedPercent = `${percent > 0 ? '+' : ''}${percent.toLocaleString('fi-FI', {
				minimumFractionDigits: 2,
				maximumFractionDigits: 2
			})} %`;

			items.push({
				guid: `alkometriikka-${id}-${current.date}-${current.price}`,
				title: `${name} — ${formatPrice(previous.price)} € → ${formatPrice(current.price)} €`,
				link,
				date: current.date,
				pubDate: toRfc822Date(current.date),
				description: `<p>Tuotteen ${name} hinta on muuttunut.</p><p>${formatPrice(
					previous.price
				)} € → ${formatPrice(current.price)} € (${formatSigned(delta, '€')}, ${signedPercent}).</p>`,
				image,
				name,
				category
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
	products: Record<string, ProductRecord>,
	ogManifest: Record<string, string>
): FeedItem[] {
	const items: FeedItem[] = [];
	for (const [productId, product] of Object.entries(products)) {
		if (!product || !Array.isArray(product.values)) continue;

		const fields = Object.fromEntries(
			schema.map((column, index) => [column, product.values[index]])
		);
		if (asText(fields.Uutuus).toLowerCase() !== 'uutuus') continue;

		const id = asText(fields.Numero);
		const name = asText(fields.Nimi) || `Tuote ${id}`;
		if (!id || id !== productId) continue;

		const history = Array.isArray(product.priceHistory) ? product.priceHistory : [];
		const date = history[0]?.date;
		if (!date) continue;

		const manufacturer = asText(fields.Valmistaja);
		const country = asText(fields.Valmistusmaa);
		const price = asNumber(fields.Hinta);
		const volume = asNumber(fields.Pullokoko);
		const abv = asNumber(fields['Alkoholi-%']);
		const category = [asText(fields.Tyyppi), asText(fields.Alatyyppi)].filter(Boolean).join(' / ');

		const details: string[] = [];
		if (manufacturer) details.push(`Valmistaja: ${manufacturer}`);
		if (country) details.push(`Valmistusmaa: ${country}`);
		if (price !== undefined) details.push(`Hinta: ${formatPrice(price)} €`);
		if (volume !== undefined) details.push(`Tilavuus: ${formatVolume(volume)}`);
		if (abv !== undefined) details.push(`Alkoholi: ${formatPercentage(abv)} %`);

		items.push({
			guid: `alkometriikka-new-${id}`,
			title: name,
			link: `${SITE_URL}/tuotteet/${encodeURIComponent(id)}/`,
			date,
			pubDate: toRfc822Date(date),
			description:
				`<p>${name} on uusi tuote Alkon valikoimassa.</p>` +
				(details.length > 0 ? `<p>${details.join('<br />')}</p>` : ''),
			image: ogManifest[productId] ? ogImageUrl(ogManifest[productId]) : alkoImageUrl(id),
			name,
			category
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
	lastBuildDateISO?: string
): string {
	const itemsXml = items
		.map(
			(item) =>
				`\t\t<item>\n` +
				`\t\t\t<title>${escapeXml(item.title)}</title>\n` +
				`\t\t\t<link>${escapeXml(item.link)}</link>\n` +
				`\t\t\t<guid isPermaLink="false">${escapeXml(item.guid)}</guid>\n` +
				`\t\t\t<pubDate>${escapeXml(item.pubDate)}</pubDate>\n` +
				(item.category ? `\t\t\t<category>${escapeXml(item.category)}</category>\n` : '') +
				`\t\t\t<description><![CDATA[${item.description}]]></description>\n` +
				(item.image ? `\t\t\t<media:thumbnail url="${escapeXml(item.image)}" />\n` : '') +
				`\t\t</item>\n`
		)
		.join('');

	const lastBuildDate = lastBuildDateISO
		? toRfc822Date(lastBuildDateISO.slice(0, 10))
		: new Date().toUTCString();

	return (
		`<?xml version="1.0" encoding="UTF-8"?>\n` +
		`<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/" xmlns:atom="http://www.w3.org/2005/Atom">\n` +
		`\t<channel>\n` +
		`\t\t<title>${escapeXml(channel.title)}</title>\n` +
		`\t\t<link>${escapeXml(channel.link)}</link>\n` +
		`\t\t<description>${escapeXml(channel.description)}</description>\n` +
		`\t\t<language>fi</language>\n` +
		`\t\t<lastBuildDate>${lastBuildDate}</lastBuildDate>\n` +
		`\t\t<generator>alkometriikka rss.ts</generator>\n` +
		`\t\t<docs>https://www.rssboard.org/rss-specification</docs>\n` +
		`\t\t<ttl>60</ttl>\n` +
		`\t\t<atom:link href="${escapeXml(channel.selfUrl)}" rel="self" type="application/rss+xml" />\n` +
		`\t\t<image>\n` +
		`\t\t\t<url>${SITE_URL}/favicon.ico</url>\n` +
		`\t\t\t<title>${escapeXml(channel.title)}</title>\n` +
		`\t\t\t<link>${SITE_URL}/</link>\n` +
		`\t\t\t<width>48</width>\n` +
		`\t\t\t<height>48</height>\n` +
		`\t\t</image>\n` +
		itemsXml +
		`\t</channel>\n` +
		`</rss>\n`
	);
}

/** Serializes feed items to the JSON Feed 1.1 format (https://jsonfeed.org). */
function generateJsonFeed(items: FeedItem[], channel: ChannelInfo): string {
	return JSON.stringify(
		{
			version: 'https://jsonfeed.org/version/1.1',
			title: channel.title,
			home_page_url: channel.link,
			feed_url: channel.selfUrl,
			description: channel.description,
			language: 'fi',
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
				// Split the hierarchical "Tyyppi / Alatyyppi" category into flat tags.
				if (item.category) entry.tags = item.category.split(' / ');
				return entry;
			})
		},
		null,
		'\t'
	);
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
		await Promise.all([
			Bun.write(
				path.join(RSS_DIR, `${productId}.xml`),
				generateRssXml(feed, channel, lastBuildDateISO)
			),
			Bun.write(
				path.join(RSS_DIR, `${productId}.json`),
				generateJsonFeed(feed, {
					...channel,
					selfUrl: `${SITE_URL}/rss/${encodeURIComponent(productId)}.json`
				})
			)
		]);
		writtenIds.add(productId);
	}

	// Prune stale per-product feeds for products that dropped out of the
	// dataset, so an old feed never lingers on the deployed site.
	const expected = new Set([...writtenIds].flatMap((id) => [`${id}.xml`, `${id}.json`]));
	let existing: string[] = [];
	try {
		existing = await readdir(RSS_DIR);
	} catch {
		existing = [];
	}
	for (const entry of existing) {
		if (!expected.has(entry)) {
			await rm(path.join(RSS_DIR, entry), { force: true });
		}
	}
	return writtenIds.size;
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

	// Reserve a slot for every currently-new product so the "uutuudet" section is
	// never crowded out of the aggregate by price changes, then fill the remaining
	// slots with the most recent price changes and sort the whole mix by date.
	const priceLimit = Math.max(0, RSS_LIMIT - newItems.length);
	const aggregate = [...newItems, ...priceChanges.slice(0, priceLimit)].sort(compareItemsByDate);
	const channel: ChannelInfo = {
		title: 'Alkometriikka – uutuudet ja hintamuutokset',
		description: 'Uusimmat uutuudet ja hinnanmuutokset Alkon tuotevalikoimassa.',
		link: `${SITE_URL}/`,
		selfUrl: `${SITE_URL}/rss.xml`
	};
	await Promise.all([
		Bun.write(RSS_AGGREGATE_PATH, generateRssXml(aggregate, channel, lastBuildDateISO)),
		Bun.write(
			FEED_AGGREGATE_PATH,
			generateJsonFeed(aggregate, { ...channel, selfUrl: `${SITE_URL}/feed.json` })
		)
	]);

	const productFeedCount = await writePerProductFeeds(byProduct, lastBuildDateISO);
	const totalChanges = [...byProduct.values()].reduce((sum, items) => sum + items.length, 0);

	console.log(
		`RSS: aggregate ${aggregate.length} of ${totalChanges} price changes + ${newItems.length} new products → ${RSS_AGGREGATE_PATH}+${FEED_AGGREGATE_PATH}; ` +
			`${productFeedCount} per-product feeds (xml+json) → ${RSS_DIR}/`
	);
}

await main();

export {};

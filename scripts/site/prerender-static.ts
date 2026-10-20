import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import Bun from 'bun';
import { readOption } from '../lib/cli';
import { escapeHtml } from '../lib/html';
import { breadcrumbJsonLd, breadcrumbNav, renderStub, SITE_URL } from '../lib/stub';
import {
	HOME_PAGE,
	STATIC_PAGES,
	storeAddress,
	storeDescription
} from '../../src/lib/utils/app/seo.ts';
import {
	SEASONS,
	seasonPath,
	seasonTitle,
	type Season
} from '../../src/lib/utils/catalog/seasons.ts';
import type { StoredDataset } from '../../src/lib/utils/catalog/dataset.ts';
import type { AvailabilityData, StoreData } from '../data/types';

/**
 * Prerenders SEO stubs for the client-rendered routes that have no product
 * data behind them: the front page, the plain static pages (laskin, tilastot,
 * …), one page per Alko store and one per season (glögit…), whose product list
 * comes from data.json. See scripts/lib/stub.ts for why stubs exist at all.
 *
 * Both sets are tiny (a few hundred files) so they are fully regenerated on
 * every run. Output is deterministic — store opening hours use the regular
 * weekly pattern, not the rolling two-week calendar — so unchanged pages stay
 * byte-identical and add nothing to the gh-pages history.
 */

const OG_IMAGE = `${SITE_URL}/images/og_image.png`;
const OG_IMAGE_ALT = 'Alkometriikka logo';

const WEEKDAYS = [
	'Sunday',
	'Monday',
	'Tuesday',
	'Wednesday',
	'Thursday',
	'Friday',
	'Saturday'
] as const;
const WEEKDAY_LABELS_FI = [
	'Sunnuntai',
	'Maanantai',
	'Tiistai',
	'Keskiviikko',
	'Torstai',
	'Perjantai',
	'Lauantai'
];

type OpeningHours = { weekday: number; hours: string };

function text(value: unknown): string {
	return value === null || value === undefined ? '' : String(value).trim();
}

function pageTitle(name: string): string {
	return `${name} - Alkometriikka`;
}

/** "10–21" / "9.30–20" → ["10:00", "21:00"]; null for "Kiinni" or anything unparseable. */
function parseHours(hours: string): [string, string] | null {
	const match = /^(\d{1,2})(?:[.:](\d{2}))?\s*[–-]\s*(\d{1,2})(?:[.:](\d{2}))?$/.exec(hours.trim());
	if (!match) return null;
	const clock = (hour: string, minutes?: string) => `${hour.padStart(2, '0')}:${minutes ?? '00'}`;
	return [clock(match[1], match[2]), clock(match[3], match[4])];
}

/** The regular weekly hours: the first seven days of Alko's "normal" calendar, ordered Monday → Sunday. */
function weeklyHours(store: StoreData): OpeningHours[] {
	const calendar = Array.isArray(store.openHoursNormal) ? store.openHoursNormal : [];
	const byWeekday = new Map<number, string>();
	for (const entry of calendar.slice(0, 7)) {
		const date = text(entry?.date);
		const hours = text(entry?.hours);
		if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !hours) continue;
		byWeekday.set(new Date(`${date}T12:00:00Z`).getUTCDay(), hours);
	}
	return [1, 2, 3, 4, 5, 6, 0].flatMap((weekday) => {
		const hours = byWeekday.get(weekday);
		return hours ? [{ weekday, hours }] : [];
	});
}

function openingHoursSpecification(hours: OpeningHours[]) {
	const groups = new Map<string, string[]>();
	for (const { weekday, hours: value } of hours) {
		if (!parseHours(value)) continue;
		groups.set(value, [...(groups.get(value) ?? []), WEEKDAYS[weekday]]);
	}
	return [...groups].map(([value, dayOfWeek]) => {
		const [opens, closes] = parseHours(value)!;
		return { '@type': 'OpeningHoursSpecification', dayOfWeek, opens, closes };
	});
}

function storeStub(template: string, store: StoreData): string {
	const id = text(store.id);
	const name = text(store.name);
	const url = `${SITE_URL}/myymalat/${encodeURIComponent(id)}/`;
	const title = pageTitle(`Myymälä - ${name}`);
	const input = {
		name,
		address: text(store.address),
		postalCode: text(store.postalCode),
		postOffice: text(store.postOffice),
		city: text(store.city)
	};
	const description = storeDescription(input);
	const hours = weeklyHours(store);
	const latitude = Number(store.latitude);
	const longitude = Number(store.longitude);
	const hasGeo =
		Number.isFinite(latitude) && Number.isFinite(longitude) && (latitude !== 0 || longitude !== 0);
	const specification = openingHoursSpecification(hours);

	const jsonLd = {
		'@context': 'https://schema.org',
		'@type': 'LiquorStore',
		'@id': url,
		url,
		name: `Alko ${name}`,
		description,
		inLanguage: 'fi-FI',
		brand: { '@type': 'Brand', name: 'Alko', url: 'https://www.alko.fi' },
		address: {
			'@type': 'PostalAddress',
			...(input.address ? { streetAddress: input.address } : {}),
			...(input.postalCode ? { postalCode: input.postalCode } : {}),
			...(text(store.city) || input.postOffice
				? { addressLocality: text(store.city) || input.postOffice }
				: {}),
			addressCountry: 'FI'
		},
		...(hasGeo ? { geo: { '@type': 'GeoCoordinates', latitude, longitude } } : {}),
		...(specification.length ? { openingHoursSpecification: specification } : {})
	};

	const trail = [{ name: 'Myymälät', path: '/myymalat/' }];
	const breadcrumb = breadcrumbJsonLd([
		{ name: 'Myymälät', url: `${SITE_URL}/myymalat/` },
		{ name: `Myymälä - ${name}`, url }
	]);

	return renderStub(template, {
		title,
		description,
		url,
		keywords: ['Alko', 'myymälä', name, input.address, input.postalCode, input.postOffice]
			.filter(Boolean)
			.join(', '),
		ogImage: OG_IMAGE,
		ogImageAlt: OG_IMAGE_ALT,
		jsonLd: [jsonLd, breadcrumb],
		fallbackName: 'store',
		fallbackHtml: `\t\t${breadcrumbNav(trail)}
\t\t<h1>${escapeHtml(`Alko ${name}`)}</h1>
\t\t<p>${escapeHtml(storeAddress(input))}</p>
\t\t${
			hours.length
				? `<dl>${hours
						.map(
							({ weekday, hours: value }) =>
								`<dt>${escapeHtml(WEEKDAY_LABELS_FI[weekday])}</dt><dd>${escapeHtml(value)}</dd>`
						)
						.join('')}</dl>`
				: ''
		}`
	});
}

/** Season pages list this many products in the fallback, and fewer in the JSON-LD. */
const SEASON_LIST_LIMIT = 100;
const SEASON_ITEM_LIST_LIMIT = 30;

type SeasonStubProduct = { id: string; name: string; price: number };

/** Active products in each season, cheapest first. */
function seasonProducts(dataset: StoredDataset): Map<Season, SeasonStubProduct[]> {
	const schema = Array.isArray(dataset.schema) ? (dataset.schema as unknown[]) : [];
	const column = (name: string) => schema.indexOf(name);
	const [number, nameIndex, price, type, subType, beerType] = [
		'Numero',
		'Nimi',
		'Hinta',
		'Tyyppi',
		'Alatyyppi',
		'Oluttyyppi'
	].map(column);
	const bySeason = new Map<Season, SeasonStubProduct[]>(SEASONS.map((season) => [season, []]));
	for (const product of Object.values(dataset.products ?? {})) {
		if (!product || !Array.isArray(product.values) || product.meta?.removedFromSelection) continue;
		const values = product.values;
		const entry = {
			id: text(values[number]),
			name: text(values[nameIndex]),
			price: Number(values[price])
		};
		if (!entry.id || !entry.name || !(entry.price > 0)) continue;
		// The same Alatyyppi fallback as the app's Kaljakori
		const input = {
			name: entry.name,
			type: text(values[type]),
			subType: text(values[subType]) || text(values[beerType]) || text(values[type])
		};
		for (const season of SEASONS) if (season.matches(input)) bySeason.get(season)!.push(entry);
	}
	for (const products of bySeason.values()) products.sort((a, b) => a.price - b.price);
	return bySeason;
}

function seasonStub(template: string, season: Season, products: SeasonStubProduct[]): string {
	const url = `${SITE_URL}${seasonPath(season)}`;
	const name = seasonTitle(season);
	const productUrl = (product: SeasonStubProduct) =>
		`${SITE_URL}/tuotteet/${encodeURIComponent(product.id)}/`;
	const euros = (price: number) =>
		`${price.toLocaleString('fi-FI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
	const collectionPage = {
		'@context': 'https://schema.org',
		'@type': 'CollectionPage',
		'@id': url,
		url,
		name,
		description: season.description,
		inLanguage: 'fi-FI',
		isPartOf: { '@type': 'WebSite', name: 'Alkometriikka', url: `${SITE_URL}/` },
		mainEntity: {
			'@type': 'ItemList',
			numberOfItems: products.length,
			itemListElement: products.slice(0, SEASON_ITEM_LIST_LIMIT).map((product, index) => ({
				'@type': 'ListItem',
				position: index + 1,
				name: product.name,
				url: productUrl(product)
			}))
		}
	};
	const trail = [{ name: 'Kausijuomat', path: '/kausi/' }];
	return renderStub(template, {
		title: pageTitle(name),
		description: season.description,
		url,
		keywords: season.keywords,
		ogImage: OG_IMAGE,
		ogImageAlt: OG_IMAGE_ALT,
		jsonLd: [
			collectionPage,
			breadcrumbJsonLd([
				{ name: 'Kausijuomat', url: `${SITE_URL}/kausi/` },
				{ name: season.title, url }
			])
		],
		fallbackName: 'season',
		fallbackHtml: `\t\t${breadcrumbNav(trail)}
\t\t<h1>${escapeHtml(season.title)}</h1>
\t\t<p>${escapeHtml(season.intro)}</p>
\t\t<p>${products.length} tuotetta valikoimassa, halvimmat ensin.</p>
\t\t<ol>${products
			.slice(0, SEASON_LIST_LIMIT)
			.map(
				(product) =>
					`<li><a href="${escapeHtml(`/tuotteet/${encodeURIComponent(product.id)}/`)}">${escapeHtml(product.name)}</a> – ${escapeHtml(euros(product.price))}</li>`
			)
			.join('')}</ol>`
	});
}

function staticStub(template: string, page: (typeof STATIC_PAGES)[number]): string {
	const url = `${SITE_URL}${page.path}`;
	const jsonLd = {
		'@context': 'https://schema.org',
		'@type': 'WebPage',
		'@id': url,
		url,
		name: page.title,
		description: page.description,
		inLanguage: 'fi-FI',
		isPartOf: { '@type': 'WebSite', name: 'Alkometriikka', url: `${SITE_URL}/` }
	};
	return renderStub(template, {
		title: pageTitle(page.title),
		description: page.description,
		url,
		keywords: page.keywords,
		ogImage: OG_IMAGE,
		ogImageAlt: OG_IMAGE_ALT,
		jsonLd: [jsonLd, breadcrumbJsonLd([{ name: page.title, url }])],
		fallbackName: 'page',
		fallbackHtml: `\t\t${breadcrumbNav([])}
\t\t<h1>${escapeHtml(page.title)}</h1>
\t\t<p>${escapeHtml(page.description)}</p>`
	});
}

/**
 * The front page. Every filtered view (`/?Tyyppi=…`) is served this same file,
 * so its canonical folds them all into `/`. The WebSite and Organization
 * JSON-LD already live in app.html, outside the replaced section.
 */
function homeStub(template: string): string {
	const sections = [...STATIC_PAGES, { path: '/kategoriat/', title: 'Kategoriat' }];
	return renderStub(template, {
		title: HOME_PAGE.title,
		description: HOME_PAGE.description,
		url: `${SITE_URL}/`,
		keywords: HOME_PAGE.keywords,
		ogImage: OG_IMAGE,
		ogImageAlt: OG_IMAGE_ALT,
		jsonLd: [],
		fallbackName: 'page',
		fallbackHtml: `\t\t<h1>${escapeHtml(HOME_PAGE.title)}</h1>
\t\t<p>${escapeHtml(HOME_PAGE.description)}</p>
\t\t<ul>${sections
			.map((page) => `<li><a href="${escapeHtml(page.path)}">${escapeHtml(page.title)}</a></li>`)
			.join('')}</ul>`
	});
}

async function writePage(outputPath: string, route: string, html: string) {
	const directory = path.join(outputPath, ...route.split('/').filter(Boolean));
	await mkdir(directory, { recursive: true });
	await Bun.write(path.join(directory, 'index.html'), html);
}

async function main() {
	const outputPath = path.resolve(readOption('--out') ?? 'build');
	const templatePath = path.resolve(readOption('--template') ?? path.join(outputPath, '404.html'));
	const availabilityPath = path.resolve(
		readOption('--availability') ?? path.join(outputPath, 'availability.json')
	);
	const dataPath = path.resolve(readOption('--data') ?? path.join(outputPath, 'data.json'));

	const template = await Bun.file(templatePath).text();

	const hasAvailability = await Bun.file(availabilityPath).exists();
	// Reset the store pages first (the /myymalat/ index shares the directory) so
	// stores that closed don't linger on the deployed site.
	if (hasAvailability)
		await rm(path.join(outputPath, 'myymalat'), { recursive: true, force: true });

	await writePage(outputPath, HOME_PAGE.path, homeStub(template));
	for (const page of STATIC_PAGES) {
		await writePage(outputPath, page.path, staticStub(template, page));
	}

	let stores = 0;
	if (hasAvailability) {
		const availability = (await Bun.file(availabilityPath).json()) as AvailabilityData;
		for (const store of Object.values(availability.stores ?? {})) {
			const id = text(store?.id);
			if (!/^[A-Za-z0-9_-]+$/.test(id) || !text(store.name)) continue;
			await writePage(outputPath, `/myymalat/${id}/`, storeStub(template, store));
			stores += 1;
		}
	} else {
		console.warn(`⚠️  Availability data not found at ${availabilityPath}; skipping store pages.`);
	}

	let seasons = 0;
	if (await Bun.file(dataPath).exists()) {
		const dataset = (await Bun.file(dataPath).json()) as StoredDataset;
		for (const [season, products] of seasonProducts(dataset)) {
			await writePage(outputPath, seasonPath(season), seasonStub(template, season, products));
			seasons += 1;
		}
	} else {
		console.warn(`⚠️  Dataset not found at ${dataPath}; skipping season pages.`);
	}

	console.log(
		`Static pages: ${STATIC_PAGES.length + 1} | Store pages: ${stores} | Season pages: ${seasons} → ${outputPath}`
	);
}

await main();

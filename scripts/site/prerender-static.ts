import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import Bun from 'bun';
import { readOption } from '../lib/cli';
import { escapeHtml } from '../lib/html';
import {
	breadcrumbJsonLd,
	breadcrumbNav,
	readRoutePreloads,
	renderStub,
	SITE_URL,
	type RouteAssets
} from '../lib/stub';
import {
	HOME_PAGE,
	STATIC_PAGES,
	storeAddress,
	storeDescription
} from '../../src/lib/utils/app/seo.ts';
import { parseStoreAccessibility } from '../../src/lib/utils/catalog/availability.ts';
import type { AvailabilityData, StoreData } from '../data/types';

/**
 * Prerenders SEO stubs for the client-rendered routes that have no product
 * data behind them: the front page, the plain static pages (laskin, tilastot,
 * …), one page per Alko store and the store index linking to them all. See scripts/lib/stub.ts for why stubs exist at all.
 *
 * Both sets are tiny (a few hundred files) so they are fully regenerated on
 * every run. Output is deterministic — store opening hours use the regular
 * weekly pattern, not the rolling two-week calendar, plus only the upcoming
 * days that differ from it — so a store's page changes only when its hours or
 * exceptions do and unchanged pages add nothing to the gh-pages history.
 */

const OG_IMAGE = `${SITE_URL}/images/og_image.png`;
const OG_IMAGE_ALT = 'Alkometriikka logo';

/** The page's own share card (scripts/og/og-static.ts), e.g. `/laskin/` → images/og/laskin.png */
function pageOgImage(pagePath: string): string {
	return `${SITE_URL}/images/og/${pagePath === '/' ? 'home' : pagePath.replaceAll('/', '')}.png`;
}

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
type ExceptionHours = { date: string; hours: string };

function text(value: unknown): string {
	return value === null || value === undefined ? '' : String(value).trim();
}

/** "2026-10-31" → "Lauantai 31.10." */
function dateLabel(date: string): string {
	const day = new Date(`${date}T12:00:00Z`);
	return `${WEEKDAY_LABELS_FI[day.getUTCDay()]} ${day.getUTCDate()}.${day.getUTCMonth() + 1}.`;
}

/** The Finnish weekday → hours list of the fallback HTML */
function hoursList(rows: [label: string, hours: string][]): string {
	return `<dl>${rows
		.map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`)
		.join('')}</dl>`;
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

/** Today in Finland as YYYY-MM-DD */
const TODAY = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Helsinki' }).format(new Date());

/**
 * Upcoming days whose hours differ from the regular ones (holidays, closures),
 * in date order. Alko's calendar can still include yesterday.
 */
function exceptionHours(store: StoreData): ExceptionHours[] {
	const calendar = Array.isArray(store.openHoursException) ? store.openHoursException : [];
	return calendar
		.map((entry) => ({ date: text(entry?.date), hours: text(entry?.hours) }))
		.filter(({ date, hours }) => /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= TODAY && hours)
		.sort((first, second) => first.date.localeCompare(second.date));
}

/** Schema.org marks a day closed with opens and closes both "00:00". */
function specialOpeningHoursSpecification(hours: ExceptionHours[]) {
	return hours.flatMap(({ date, hours: value }) => {
		const range = /^kiinni$/i.test(value) ? (['00:00', '00:00'] as const) : parseHours(value);
		if (!range) return [];
		const [opens, closes] = range;
		return [
			{
				'@type': 'OpeningHoursSpecification',
				validFrom: date,
				validThrough: date,
				opens,
				closes
			}
		];
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

function storeStub(template: string, route: RouteAssets | undefined, store: StoreData): string {
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
	const exceptions = exceptionHours(store);
	const mapQuery = ['Alko', name, storeAddress(input)].filter(Boolean).join(', ');
	const latitude = Number(store.latitude);
	const longitude = Number(store.longitude);
	const hasGeo =
		Number.isFinite(latitude) && Number.isFinite(longitude) && (latitude !== 0 || longitude !== 0);
	const specification = openingHoursSpecification(hours);
	const specialSpecification = specialOpeningHoursSpecification(exceptions);

	const jsonLd = {
		'@context': 'https://schema.org',
		'@type': 'LiquorStore',
		'@id': url,
		url,
		name: `Alko ${name}`,
		description,
		brand: { '@type': 'Brand', name: 'Alko', url: 'https://www.alko.fi' },
		sameAs: `https://www.alko.fi/myymalat-palvelut/${encodeURIComponent(id)}`,
		hasMap: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`,
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
		...(specification.length ? { openingHoursSpecification: specification } : {}),
		...(specialSpecification.length
			? { specialOpeningHoursSpecification: specialSpecification }
			: {}),
		...(parseStoreAccessibility(text(store.unobstructured)).accessible
			? {
					amenityFeature: [
						{ '@type': 'LocationFeatureSpecification', name: 'Esteetön', value: true }
					]
				}
			: {})
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
		route,
		jsonLd: [jsonLd, breadcrumb],
		fallbackName: 'store',
		fallbackHtml: `\t\t${breadcrumbNav(trail)}
\t\t<h1>${escapeHtml(`Alko ${name}`)}</h1>
\t\t<p>${escapeHtml(storeAddress(input))}</p>
\t\t${hours.length ? hoursList(hours.map(({ weekday, hours: value }) => [WEEKDAY_LABELS_FI[weekday], value])) : ''}${
			exceptions.length
				? `
\t\t<h2>Poikkeusaukioloajat</h2>
\t\t${hoursList(exceptions.map(({ date, hours: value }) => [dateLabel(date), value]))}`
				: ''
		}`
	});
}

/** Stores grouped by city, cities and the stores in each in Finnish alphabetical order. */
function storesByCity(stores: StoreData[]): [city: string, stores: StoreData[]][] {
	const compare = (first: string, second: string) =>
		first.localeCompare(second, 'fi', { sensitivity: 'base' });
	const groups = new Map<string, StoreData[]>();
	for (const store of stores) {
		const city = text(store.city) || text(store.postOffice) || 'Muut';
		groups.set(city, [...(groups.get(city) ?? []), store]);
	}
	return [...groups]
		.sort(([first], [second]) => compare(first, second))
		.map(([city, group]) => [city, group.sort((a, b) => compare(text(a.name), text(b.name)))]);
}

/**
 * The /myymalat/ index: a static page whose stub also links every store page,
 * the only links crawlers get to them besides the sitemap.
 */
function storeIndexStub(
	template: string,
	route: RouteAssets | undefined,
	page: (typeof STATIC_PAGES)[number],
	stores: StoreData[]
): string {
	const url = `${SITE_URL}${page.path}`;
	const storePath = (store: StoreData) => `/myymalat/${encodeURIComponent(text(store.id))}/`;
	const groups = storesByCity(stores);
	const jsonLd = {
		'@context': 'https://schema.org',
		'@type': 'CollectionPage',
		'@id': url,
		url,
		name: page.title,
		description: page.description,
		inLanguage: 'fi-FI',
		isPartOf: { '@type': 'WebSite', name: 'Alkometriikka', url: `${SITE_URL}/` },
		mainEntity: {
			'@type': 'ItemList',
			numberOfItems: stores.length,
			itemListElement: groups
				.flatMap(([, group]) => group)
				.map((store, index) => ({
					'@type': 'ListItem',
					position: index + 1,
					name: `Alko ${text(store.name)}`,
					url: `${SITE_URL}${storePath(store)}`
				}))
		}
	};
	return renderStub(template, {
		title: pageTitle(page.title),
		description: page.description,
		url,
		keywords: page.keywords,
		ogImage: pageOgImage(page.path),
		ogImageAlt: `${page.title} – Alkometriikka`,
		route,
		jsonLd: [jsonLd, breadcrumbJsonLd([{ name: page.title, url }])],
		fallbackName: 'page',
		fallbackHtml: `\t\t${breadcrumbNav([])}
\t\t<h1>${escapeHtml(page.title)}</h1>
\t\t<p>${escapeHtml(page.description)}</p>
${groups
	.map(
		([city, group]) =>
			`\t\t<h2>${escapeHtml(city)}</h2>
\t\t<ul>${group
				.map(
					(store) =>
						`<li><a href="${escapeHtml(storePath(store))}">${escapeHtml(`Alko ${text(store.name)}`)}</a>${text(store.address) ? `, ${escapeHtml(text(store.address))}` : ''}</li>`
				)
				.join('')}</ul>`
	)
	.join('\n')}`
	});
}

function staticStub(
	template: string,
	route: RouteAssets | undefined,
	page: (typeof STATIC_PAGES)[number]
): string {
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
		ogImage: pageOgImage(page.path),
		ogImageAlt: `${page.title} – Alkometriikka`,
		route,
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
function homeStub(template: string, route: RouteAssets | undefined): string {
	const sections = [...STATIC_PAGES, { path: '/kategoriat/', title: 'Kategoriat' }];
	return renderStub(template, {
		title: HOME_PAGE.title,
		description: HOME_PAGE.description,
		url: `${SITE_URL}/`,
		keywords: HOME_PAGE.keywords,
		ogImage: pageOgImage(HOME_PAGE.path),
		ogImageAlt: 'Alkometriikka',
		route,
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

	const template = await Bun.file(templatePath).text();
	const preloads = await readRoutePreloads(outputPath);
	// `/laskin/` → `/laskin`, the route id
	const routeOf = (pagePath: string) => preloads[pagePath.replace(/(.)\/$/, '$1')];

	const hasAvailability = await Bun.file(availabilityPath).exists();
	// Reset the store pages first (the /myymalat/ index shares the directory) so
	// stores that closed don't linger on the deployed site.
	if (hasAvailability)
		await rm(path.join(outputPath, 'myymalat'), { recursive: true, force: true });

	const stores = hasAvailability
		? Object.values(
				((await Bun.file(availabilityPath).json()) as AvailabilityData).stores ?? {}
			).filter((store) => /^[A-Za-z0-9_-]+$/.test(text(store?.id)) && text(store.name))
		: [];
	if (!hasAvailability) {
		console.warn(`⚠️  Availability data not found at ${availabilityPath}; skipping store pages.`);
	}

	await writePage(outputPath, HOME_PAGE.path, homeStub(template, routeOf(HOME_PAGE.path)));
	for (const page of STATIC_PAGES) {
		const html =
			page.path === '/myymalat/' && stores.length
				? storeIndexStub(template, routeOf(page.path), page, stores)
				: staticStub(template, routeOf(page.path), page);
		await writePage(outputPath, page.path, html);
	}

	for (const store of stores) {
		await writePage(
			outputPath,
			`/myymalat/${text(store.id)}/`,
			storeStub(template, preloads['/myymalat/[storeID]'], store)
		);
	}

	console.log(
		`Static pages: ${STATIC_PAGES.length + 1} | Store pages: ${stores.length} → ${outputPath}`
	);
}

await main();

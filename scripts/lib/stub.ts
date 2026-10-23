import path from 'node:path';
import Bun from 'bun';
import { OG_IMAGE_WIDTH, OG_IMAGE_HEIGHT } from '../og/og';
import { escapeHtml, escapeJson, minifyHtml, replaceMarkedSection } from './html';
import { STUB_DATA_ID } from '../../src/lib/utils/app/seo.ts';

export const SITE_URL = 'https://alkometriikka.fi';

/** Written next to the site by scripts/site/route-preloads.ts */
export const ROUTE_PRELOADS_FILE = 'route-preloads.json';

/** A page route's built code, as paths from the site root, keyed by route id (`/tuotteet/[...id]`) */
export type RoutePreloads = Record<string, RouteAssets>;
export type RouteAssets = { imports: string[]; stylesheets: string[] };

/**
 * The route preloads next to the site, or empty (stubs then preload only the shell's own code)
 * when they haven't been written, e.g. on a deploy from before they existed
 */
export async function readRoutePreloads(outputPath: string): Promise<RoutePreloads> {
	const file = path.join(outputPath, ROUTE_PRELOADS_FILE);
	return Bun.file(file)
		.json()
		.then((value) => value as RoutePreloads)
		.catch(() => {
			console.warn(`⚠️  No route preloads at ${file}; stubs will preload only the page shell.`);
			return {};
		});
}

/**
 * A prerendered page stub. The app is a client-rendered SPA served through the
 * static adapter's `404.html` fallback, and link-preview/SEO crawlers don't
 * execute JS — so every indexable page gets a real file whose <head> (and a
 * plain-HTML <body> fallback) already carries its own metadata. The SvelteKit
 * app boots normally once a browser loads it and removes the fallback.
 */
export type StubPage = {
	title: string;
	description: string;
	url: string;
	keywords?: string;
	ogType?: string;
	ogImage: string;
	ogImageAlt: string;
	/** `<link>` tags placed right after the canonical link (e.g. RSS alternates) */
	alternates?: string[];
	/**
	 * The page's main photo (its LCP element), fetched at high priority straight from the HTML.
	 * Requested like ProductImage does (CORS, no referrer), so the app reuses the download
	 */
	preloadImage?: string;
	/**
	 * The page route's code. The shell preloads only the root layout's, so without these the
	 * browser finds the route's chunks only once the app starts, by then sharing the connection
	 * with the price list download
	 */
	route?: RouteAssets;
	/** Extra meta tags placed after the og:image tags (e.g. product:price:*) */
	ogExtra?: string[];
	jsonLd: object[];
	/** Becomes `data-prerendered-{fallbackName}` on the fallback article */
	fallbackName: string;
	fallbackHtml: string;
	/** Data the app reads to render the page before the price list loads (see STUB_DATA_ID) */
	data?: unknown;
};

export function breadcrumbJsonLd(items: { name: string; url: string }[]) {
	const trail = [{ name: 'Alkometriikka', url: `${SITE_URL}/` }, ...items];
	return {
		'@context': 'https://schema.org',
		'@type': 'BreadcrumbList',
		// Search Console labels each BreadcrumbList by its own name, showing "N/A" without one
		name: trail.map((item) => item.name).join(' › '),
		itemListElement: trail.map((item, index) => ({
			'@type': 'ListItem',
			position: index + 1,
			name: item.name,
			item: item.url
		}))
	};
}

export function breadcrumbNav(trail: { name: string; path: string }[]): string {
	return `<nav>${[{ name: 'Alkometriikka', path: '/' }, ...trail]
		.map((node) => `<a href="${escapeHtml(node.path)}">${escapeHtml(node.name)}</a>`)
		.join(' › ')}</nav>`;
}

/** Preload links for the route's code the shell doesn't already load */
function routePreloadLinks(template: string, route: RouteAssets | undefined): string[] {
	if (!route) return [];
	// The shell's own links carry the base path, e.g. `/_app/immutable/entry/start.….js`
	const base = template.match(/href="([^"]*)_app\/immutable\/entry\//)?.[1] ?? '/';
	const links: string[] = [];
	for (const [files, rel] of [
		[route.imports, 'rel="modulepreload"'],
		[route.stylesheets, 'rel="preload" as="style"']
	] as const) {
		for (const file of files) {
			const href = `${base}${file}`;
			if (!template.includes(`href="${href}"`))
				links.push(`\t<link ${rel} href="${escapeHtml(href)}" />`);
		}
	}
	return links;
}

export function renderStub(template: string, page: StubPage): string {
	const metadata = [
		`\t<meta name="description" content="${escapeHtml(page.description)}" />`,
		...(page.keywords ? [`\t<meta name="keywords" content="${escapeHtml(page.keywords)}" />`] : []),
		...(page.preloadImage
			? [
					`\t<link rel="preload" as="image" href="${escapeHtml(page.preloadImage)}" fetchpriority="high" crossorigin="anonymous" referrerpolicy="no-referrer" />`
				]
			: []),
		...routePreloadLinks(template, page.route),
		`\t<link rel="canonical" href="${escapeHtml(page.url)}" />`,
		...(page.alternates ?? []),
		`\t<meta property="og:type" content="${escapeHtml(page.ogType ?? 'website')}" />`,
		`\t<meta property="og:title" content="${escapeHtml(page.title)}" />`,
		`\t<meta property="og:url" content="${escapeHtml(page.url)}" />`,
		`\t<meta property="og:description" content="${escapeHtml(page.description)}" />`,
		`\t<meta property="og:site_name" content="Alkometriikka" />`,
		`\t<meta property="og:image" content="${escapeHtml(page.ogImage)}" />`,
		`\t<meta property="og:image:width" content="${OG_IMAGE_WIDTH}" />`,
		`\t<meta property="og:image:height" content="${OG_IMAGE_HEIGHT}" />`,
		`\t<meta property="og:image:alt" content="${escapeHtml(page.ogImageAlt)}" />`,
		...(page.ogExtra ?? []),
		// X falls back to the og: title, description and image
		`\t<meta name="twitter:card" content="summary_large_image" />`,
		...page.jsonLd.map(
			(entry) => `\t<script type="application/ld+json">${escapeJson(entry)}</script>`
		)
	].join('\n');

	const attribute = `data-prerendered-${page.fallbackName}`;
	const fallback = `
\t<article ${attribute} style="max-width:80rem;margin:0 auto;padding:2rem;font-family:sans-serif">
${page.fallbackHtml}
\t</article>
\t<script>document.querySelector('[${attribute}]')?.remove();document.currentScript?.remove();</script>${
		page.data === undefined
			? ''
			: `\n\t<script type="application/json" id="${STUB_DATA_ID}">${escapeJson(page.data)}</script>`
	}`;

	let html = replaceMarkedSection(template, metadata);
	html = html.replace(/<title>[^<]*<\/title>/, () => `<title>${escapeHtml(page.title)}</title>`);
	html = html.replace(/<body(?:\s[^>]*)?>/, (tag) => `${tag}${fallback}`);
	return minifyHtml(html);
}

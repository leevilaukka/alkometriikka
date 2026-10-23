import { OG_IMAGE_WIDTH, OG_IMAGE_HEIGHT } from '../og/og';
import { escapeHtml, escapeJson, minifyHtml, replaceMarkedSection } from './html';
import { STUB_DATA_ID } from '../../src/lib/utils/app/seo.ts';

export const SITE_URL = 'https://alkometriikka.fi';

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

export function renderStub(template: string, page: StubPage): string {
	const metadata = [
		`\t<meta name="description" content="${escapeHtml(page.description)}" />`,
		...(page.keywords ? [`\t<meta name="keywords" content="${escapeHtml(page.keywords)}" />`] : []),
		...(page.preloadImage
			? [
					`\t<link rel="preload" as="image" href="${escapeHtml(page.preloadImage)}" fetchpriority="high" crossorigin="anonymous" referrerpolicy="no-referrer" />`
				]
			: []),
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

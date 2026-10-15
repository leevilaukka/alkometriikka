import { locale } from '$lib/i18n';

/**
 * Site path of an aggregate feed in the current language. The English and Swedish copies sit
 * next to the Finnish ones as `rss.<locale>.xml` and `feed.<locale>.json` (scripts/site/rss.ts).
 * Per-product and per-category feeds are Finnish only.
 */
export function feedPath(file: 'rss.xml' | 'feed.json'): string {
	if (locale === 'fi') return `/${file}`;
	const dot = file.lastIndexOf('.');
	return `/${file.slice(0, dot)}.${locale}${file.slice(dot)}`;
}

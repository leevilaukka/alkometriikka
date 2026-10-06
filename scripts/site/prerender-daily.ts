import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { dailyOgUrl } from '../og/og-daily-card';
import { toISODateInTimeZone } from '../../src/lib/utils/sales';
import { dayNumberForDate } from '../../src/lib/daily/dayNumber';
import { readOption } from '../lib/cli';
import { escapeHtml } from '../lib/html';
import { renderStub, SITE_URL } from '../lib/stub';

/**
 * Writes a static `daily/index.html` stub, mirroring scripts/site/prerender-products.ts.
 *
 * The `/daily/` route is a normal client-rendered SvelteKit page (prerender is
 * off site-wide), so it's served through the static-adapter's `404.html` SPA
 * fallback. Link-preview crawlers don't execute JS, so they never see the
 * `setSEO()` call in +page.svelte — only a real file at `daily/index.html`
 * changes what they fetch. This regenerates that file every run with today's
 * date baked into the OG/Twitter image tags; the SvelteKit app boots
 * normally once a browser loads it, exactly like the product page stubs.
 */

const TITLE = 'Daily - Alkometriikka';
const DESCRIPTION =
	'Alkometriikka Daily on seitsemän kysymyksen tietovisa Alkon valikoimasta. Testaa Alko(holi) tuntemuksesi!';

async function main() {
	const templatePath = path.resolve(readOption('--template') ?? 'build/404.html');
	const outDir = path.resolve(readOption('--out') ?? './daily');
	const date = readOption('--date') ?? toISODateInTimeZone('Europe/Helsinki');

	const dayNumber = dayNumberForDate(date);
	const template = await Bun.file(templatePath).text();

	const url = `${SITE_URL}/daily/`;
	const ogImage = dailyOgUrl(date);

	const jsonLd = {
		'@context': 'https://schema.org',
		'@type': 'Quiz',
		name: TITLE,
		description: DESCRIPTION,
		url,
		inLanguage: 'fi-FI',
		datePublished: date,
		isPartOf: { '@type': 'WebSite', name: 'Alkometriikka', url: SITE_URL },
		publisher: { '@type': 'Organization', name: 'Alkometriikka', url: SITE_URL }
	};

	const html = renderStub(template, {
		title: TITLE,
		description: DESCRIPTION,
		url,
		ogImage,
		ogImageAlt: 'Alkometriikka Daily',
		jsonLd: [jsonLd],
		// Crawlers that don't execute JS need real content in <body>, not just
		// <head> metadata — otherwise there's no H1 for them to see.
		fallbackName: 'daily',
		fallbackHtml: `\t\t<nav><a href="/">Alkometriikka</a></nav>
\t\t<header>
\t\t\t<h1>${escapeHtml(TITLE)}</h1>
\t\t\t<p>${escapeHtml(DESCRIPTION)}</p>
\t\t</header>`
	});

	await mkdir(outDir, { recursive: true });
	await Bun.write(path.join(outDir, 'index.html'), html);
	console.log(
		`Daily page prerendered: ${date} (day #${dayNumber}) → ${path.join(outDir, 'index.html')}`
	);
}

await main();

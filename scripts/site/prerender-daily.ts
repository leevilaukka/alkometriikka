import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { OG_IMAGE_WIDTH, OG_IMAGE_HEIGHT } from '../og/og';
import { dailyOgUrl } from '../og/og-daily-card';
import { toISODateInTimeZone } from '../../src/lib/utils/sales';

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

const SITE_URL = 'https://alkometriikka.fi';
const SEO_START = '<!-- Dynamic SEO data start -->';
const SEO_END = '<!-- Dynamic SEO data end -->';
const TITLE = 'Daily - Alkometriikka';
const DESCRIPTION =
	'Alkometriikka Daily on seitsemän kysymyksen tietovisa Alkon valikoimasta. Testaa Alko(holi) tuntemuksesi!';

function readOption(name: string): string | undefined {
	const index = process.argv.indexOf(name);
	return index === -1 ? undefined : process.argv[index + 1];
}

function escapeHtml(value: unknown): string {
	return String(value ?? '')
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}

function replaceMarkedSection(template: string, content: string): string {
	const start = template.indexOf(SEO_START);
	const end = template.indexOf(SEO_END, start);
	if (start === -1 || end === -1) {
		throw new Error('SEO markers are missing from the template');
	}
	return `${template.slice(0, start)}${SEO_START}\n${content}\n\t${template.slice(end)}`;
}

async function readDayNumber(archiveIndexPath: string): Promise<number> {
	try {
		const index = (await Bun.file(archiveIndexPath).json()) as { dates?: string[] };
		return (Array.isArray(index.dates) ? index.dates.length : 0) + 1;
	} catch {
		return 1;
	}
}

async function main() {
	const templatePath = path.resolve(readOption('--template') ?? 'build/404.html');
	const archiveIndexPath = path.resolve(
		readOption('--archive-index') ?? './daily/archive/index.json'
	);
	const outDir = path.resolve(readOption('--out') ?? './daily');
	const date = readOption('--date') ?? toISODateInTimeZone('Europe/Helsinki');

	const dayNumber = await readDayNumber(archiveIndexPath);
	const template = await Bun.file(templatePath).text();

	const url = `${SITE_URL}/daily/`;
	const ogImage = dailyOgUrl(date);

	const metadata = [
		`\t<meta name="description" content="${escapeHtml(DESCRIPTION)}" />`,
		`\t<link rel="canonical" href="${escapeHtml(url)}" />`,
		`\t<meta property="og:type" content="website" />`,
		`\t<meta property="og:title" content="${escapeHtml(TITLE)}" />`,
		`\t<meta property="og:url" content="${escapeHtml(url)}" />`,
		`\t<meta property="og:description" content="${escapeHtml(DESCRIPTION)}" />`,
		`\t<meta property="og:site_name" content="Alkometriikka" />`,
		`\t<meta property="og:image" content="${escapeHtml(ogImage)}" />`,
		`\t<meta property="og:image:width" content="${OG_IMAGE_WIDTH}" />`,
		`\t<meta property="og:image:height" content="${OG_IMAGE_HEIGHT}" />`,
		`\t<meta property="og:image:alt" content="Alkometriikka Daily" />`,
		`\t<meta name="twitter:card" content="summary_large_image" />`,
		`\t<meta name="twitter:title" content="${escapeHtml(TITLE)}" />`,
		`\t<meta name="twitter:description" content="${escapeHtml(DESCRIPTION)}" />`,
		`\t<meta name="twitter:image" content="${escapeHtml(ogImage)}" />`
	].join('\n');

	let html = replaceMarkedSection(template, metadata);
	html = html.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(TITLE)}</title>`);

	await mkdir(outDir, { recursive: true });
	await Bun.write(path.join(outDir, 'index.html'), html);
	console.log(
		`Daily page prerendered: ${date} (day #${dayNumber}) → ${path.join(outDir, 'index.html')}`
	);
}

await main();

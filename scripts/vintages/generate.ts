import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { downloadPdf } from './download.ts';
import { extractTextWithOcrFallback } from './extract.ts';
import { parseVintageDocument } from './parse.ts';
import { validateVintageDocument } from './validate.ts';
import type { WineType } from './types.ts';

interface VintageSource {
	id: string;
	title: string;
	url: string;
	/** Matches this dataset's product `Tyyppi` field, so a product can be matched to its vintage document directly. */
	wineType: WineType;
}

/**
 * Registry of known Alko vintage-rating PDFs. Only sources that have been verified against this
 * parser (via `bun test scripts/vintages/`) are listed here - Alko publishes several more PDFs
 * that may use a different layout this parser doesn't handle yet; verify manually before adding.
 */
const SOURCES: VintageSource[] = [
	{
		id: 'de-at-hu-white',
		title: 'Saksan, Itävallan ja Unkarin valkoviinit - vuosikertataulukko',
		wineType: 'valkoviinit',
		url: 'https://assets.eu.ctfassets.net/5wdmhh7f9rpx/5f2ZkvTwzYa1LKZmgAxROt/14aad0443d24797b3ecb181b50c72b9b/Saksan__It%C3%83_vallan_ja_Unkarin_valkoviinit_-_vuosikertataulukko.pdf'
	},
	{
		id: 'es-pt-red',
		title: 'Espanjan ja Portugalin punaviinit ja portviinit - vuosikertataulukko',
		wineType: 'punaviinit',
		url: 'https://assets.eu.ctfassets.net/5wdmhh7f9rpx/5IZMCpigdkLSU72l0Pm52/d89711261e906866bf8fb6bda34fa429/Espanjan_ja_Portugalin_punaviinit_ja_portviinit_-_vuosikertataulukko.pdf'
	},
	{
		id: 'it-red',
		title: 'Italian punaviinit - vuosikertataulukko',
		wineType: 'punaviinit',
		url: 'https://assets.eu.ctfassets.net/5wdmhh7f9rpx/2e9QrvhQ8CUTvjKwC400Xf/5cd712119526600700cb78f9673777c9/Italian_punaviinit_-_vuosikertataulukko.pdf'
	},
	{
		id: 'es-pt-white',
		title: 'Espanjan ja Portugalin valkoviinit - vuosikertataulukko',
		wineType: 'valkoviinit',
		url: 'https://assets.eu.ctfassets.net/5wdmhh7f9rpx/3zohTeaaFDkAEqXJxjmmy7/16c4dc4b5b608d1be55fcc27af4e3fc2/Espanjan_ja_Portugalin_valkoviinit_-_vuosikertataulukko.pdf'
	},
	{
		id: 'it-white',
		title: 'Italian valkoviinit - vuosikertataulukko',
		wineType: 'valkoviinit',
		url: 'https://assets.eu.ctfassets.net/5wdmhh7f9rpx/6voyvxMDFPkqdDtCMMMgV/92d3427259372ee44913625eac90518a/Italian_valkoviinit_-_vuosikertataulukko.pdf'
	},
	{
		id: 'fr-red',
		title: 'Ranskan punaviinit - vuosikertataulukko',
		wineType: 'punaviinit',
		url: 'https://assets.eu.ctfassets.net/5wdmhh7f9rpx/46w72cBedahs559Hsb8kD0/a2389c950b02a518d0903a301a035f77/Ranskan_punaviinit_-_vuosikertataulukko.pdf'
	},
	{
		id: 'de-at-gr-red',
		title: 'Saksan, Itävallan ja Kreikan punaviinit - vuosikertataulukko',
		wineType: 'punaviinit',
		url: 'https://assets.eu.ctfassets.net/5wdmhh7f9rpx/4bUes0fD0F685cdLffeit2/111d36924fd784f1724e05ee436042ea/Saksan__It%C3%83_vallan_ja_Kreikan_punaviinit_-_vuosikertataulukko.pdf'
	},
	{
		id: 'new-world-red',
		title: 'Uuden maailman punaviinit - vuosikertataulukko',
		wineType: 'punaviinit',
		url: 'https://assets.eu.ctfassets.net/5wdmhh7f9rpx/4Q34pgsGF7RaOu6RzTM70c/9783fb3c2b3dfef020daf73d5f736d0a/Uuden_maailman_punaviinit_-_vuosikertataulukko.pdf'
	},
	{
		id: 'fr-champagne-white',
		title: 'Ranskan valkoviinit ja samppanja - vuosikertataulukko',
		wineType: 'valkoviinit',
		url: 'https://assets.eu.ctfassets.net/5wdmhh7f9rpx/76eZ4Qqqjq8mUbaFlCOyJ2/08936220b3b699b124837d4b7a9041e7/Ranskan_valkoviinit_ja_samppanja_-_vuosikertataulukko.pdf'
	},
	{
		id: 'new-world-white',
		title: 'Uuden maailman valkoviinit - vuosikertataulukko',
		wineType: 'valkoviinit',
		url: 'https://assets.eu.ctfassets.net/5wdmhh7f9rpx/7Fn1MdxUmyICqUfMt3xyhc/6a2d82d8dd3d824c81298bb279416ed7/Uuden_maailman_valkoviinit_-_vuosikertataulukko.pdf'
	}
];

const CACHE_DIR = path.resolve('scripts/vintages/.cache');

function readOption(name: string): string | undefined {
	const index = process.argv.indexOf(name);
	return index === -1 ? undefined : process.argv[index + 1];
}

async function run() {
	const outputPath = path.resolve(readOption('--out') ?? 'static/vintages.json');
	const forceRefresh = process.argv.includes('--force');

	const documents = [];
	for (const source of SOURCES) {
		console.log(`Processing ${source.id}...`);
		const bytes = await downloadPdf(source.url, { cacheDir: CACHE_DIR, forceRefresh });
		const extracted = await extractTextWithOcrFallback(bytes);
		const parsed = parseVintageDocument(extracted, {
			source: source.url,
			title: source.title,
			wineType: source.wineType
		});
		const validated = validateVintageDocument(parsed);
		documents.push({ id: source.id, ...validated });
		console.log(`  -> ${validated.regions.length} regions parsed.`);
	}

	await mkdir(path.dirname(outputPath), { recursive: true });
	await Bun.write(outputPath, JSON.stringify(documents, null, '\t') + '\n');
	console.log(`Wrote ${documents.length} document(s) to ${outputPath}`);
}

await run();

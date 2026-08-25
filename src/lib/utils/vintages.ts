import type { PriceListItem, VintageDocument, VintageRegion } from '$lib/types';
import { AllColumns } from './constants';
import { similarity } from './search';

/** Minimum area-name similarity (see `similarity`) required to accept a fuzzy region match. */
const AREA_MATCH_THRESHOLD = 0.5;

export type VintageMatch = {
	document: VintageDocument;
	region: VintageRegion;
	/** The product's own vintage year, or null if it doesn't have one. */
	vintage: string | null;
	/** Rating for the product's vintage year, or null if that year isn't in the region's ratings. */
	score: number | null;
};

function normalize(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '');
}

/**
 * Finds the vintage-rating region that best matches a product, using its country
 * (`Valmistusmaa`) and region (`Alue`) fields. Region names in Alko's vintage PDFs don't always
 * match the product dataset's region names exactly (e.g. abbreviations, different granularity),
 * so region matching is fuzzy; country matching is closer to exact since both datasets use the
 * same Finnish country names.
 */
export function findVintageMatch(
	product: PriceListItem,
	documents: VintageDocument[]
): VintageMatch | null {
    console.log(product, documents.map(d => d.title));
	const wineType = product[AllColumns.SubType].toLocaleLowerCase() as 'punaviinit' | 'valkoviinit';
	const country = product[AllColumns.Country];
	const region = product[AllColumns.Region].split(" - ")[0];
	const vintage = product[AllColumns.Vintage];

    console.log("findVintageMatch", { wineType, country, region, vintage });

	if (!wineType || !country) return null;

	const candidateDocuments = documents.filter((doc) => doc.wineType === wineType);
	if (candidateDocuments.length === 0) return null;

	const normalizedCountry = normalize(String(country));
	const normalizedRegion = region ? normalize(String(region)) : null;

	let best: { document: VintageDocument; region: VintageRegion; score: number } | null = null;

    console.log("findVintageMatch", { normalizedCountry, normalizedRegion, candidateDocuments: candidateDocuments.map(d => d.title) });

	for (const document of candidateDocuments) {
		for (const candidate of document.regions) {
			const candidateCountry = candidate.country ?? candidate.area;
			if (normalize(candidateCountry) !== normalizedCountry) continue;

			// A region with no separate area tier (country is the area itself) is a plain country match.
			const isCountryOnlyRegion = candidate.country === null;
			const matchScore = isCountryOnlyRegion
				? 1
				: normalizedRegion
					? similarity(normalize(candidate.area), normalizedRegion)
					: 0;

			if (matchScore < AREA_MATCH_THRESHOLD) continue;
			if (!best || matchScore > best.score) {
				best = { document, region: candidate, score: matchScore };
			}
		}
	}

	if (!best) return null;

	const vintageText = vintage ? String(vintage).trim() : '';
	const ratingScore =
		vintageText && best.region.ratings[vintageText] !== undefined
			? best.region.ratings[vintageText]
			: null;

	return {
		document: best.document,
		region: best.region,
		vintage: vintageText || null,
		score: ratingScore
	};
}

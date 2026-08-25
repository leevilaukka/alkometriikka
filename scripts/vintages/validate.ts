import type { ParsedVintageDocument, WineType } from './types.ts';

const MIN_YEAR = 1900;
const MAX_YEAR = new Date().getFullYear() + 1;
const MIN_SCORE = 0;
const MAX_SCORE = 20;
const VALID_WINE_TYPES: WineType[] = ['punaviinit', 'valkoviinit'];

/**
 * Validates a parsed vintage document before it's written out. Throws with a descriptive message
 * on the first problem found - a layout change or malformed extraction should fail the build
 * rather than silently producing incorrect scores.
 */
export function validateVintageDocument(doc: ParsedVintageDocument): ParsedVintageDocument {
	if (!doc.source) {
		throw new Error('Parsed document is missing a source URL.');
	}
	if (!VALID_WINE_TYPES.includes(doc.wineType)) {
		throw new Error(
			`Unknown wineType "${doc.wineType}"; expected one of ${VALID_WINE_TYPES.join(', ')}.`
		);
	}
	if (!Array.isArray(doc.regions) || doc.regions.length < 2) {
		throw new Error(
			`Expected at least 2 regions in a vintage-rating table, found ${doc.regions?.length ?? 0}.`
		);
	}

	const seenRegionKeys = new Set<string>();
	let totalRatings = 0;

	for (const region of doc.regions) {
		const area = region.area?.trim();
		if (!area) {
			throw new Error('Encountered a region with an empty area name.');
		}
		const name = region.name?.trim() || area;

		const key = `${region.country?.trim().toLowerCase() ?? ''}::${area.toLowerCase()}`;
		if (seenRegionKeys.has(key)) {
			throw new Error(`Duplicate region detected: "${name}".`);
		}
		seenRegionKeys.add(key);

		const entries = Object.entries(region.ratings ?? {});
		if (entries.length === 0) {
			throw new Error(`Region "${name}" has no ratings at all.`);
		}

		const seenYears = new Set<string>();
		for (const [yearText, score] of entries) {
			if (seenYears.has(yearText)) {
				throw new Error(`Duplicate year "${yearText}" for region "${name}".`);
			}
			seenYears.add(yearText);

			const year = Number.parseInt(yearText, 10);
			if (
				!Number.isInteger(year) ||
				String(year) !== yearText ||
				year < MIN_YEAR ||
				year > MAX_YEAR
			) {
				throw new Error(`Region "${name}" has an implausible vintage year "${yearText}".`);
			}

			if (!Number.isInteger(score) || score < MIN_SCORE || score > MAX_SCORE) {
				throw new Error(
					`Region "${name}", year ${yearText}: score ${score} is outside the expected ${MIN_SCORE}-${MAX_SCORE} range.`
				);
			}

			totalRatings++;
		}
	}

	if (totalRatings < doc.regions.length) {
		throw new Error('Suspiciously few ratings were extracted relative to the number of regions.');
	}

	return doc;
}

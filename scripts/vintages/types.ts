/** A single piece of text extracted from a PDF, positioned in top-left-origin page coordinates (points). */
export interface TextItem {
	text: string;
	x: number;
	y: number;
	width: number;
	height: number;
	page: number;
}

export interface ExtractedPage {
	page: number;
	items: TextItem[];
}

export interface ExtractedDocument {
	pages: ExtractedPage[];
	/** Whether the PDF's embedded text layer looks usable (vs. a scanned/rasterized page with no text). */
	hasTextLayer: boolean;
}

/** Ratings keyed by vintage year (as a string, e.g. "2020") mapping to a 0-20 score. */
export type RegionRatings = Record<string, number>;

export interface ParsedRegion {
	/** Broader group the area belongs to (e.g. a country), if the table has that grouping tier. */
	country: string | null;
	/** The most specific label for this column (e.g. a wine region, or the country itself if it isn't subdivided). */
	area: string;
	/** Convenience display label: `country – area`, or just `area` when there's no separate country tier. */
	name: string;
	ratings: RegionRatings;
}

/**
 * Matches the `Tyyppi` field values already used for products in data.json (see
 * src/lib/types.ts PriceListItem), so a product's wine type can be matched directly against a
 * vintage document's `wineType` without a separate mapping table.
 */
export type WineType = 'punaviinit' | 'valkoviinit';

export interface ParsedVintageDocument {
	source: string;
	title: string;
	wineType: WineType;
	extractedAt: string;
	regions: ParsedRegion[];
}

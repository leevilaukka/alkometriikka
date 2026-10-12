export const VIINILEHTI_ORIGIN = 'https://viinilehti.fi';

export type WineReview = {
	id: string;
	sku: string;
	vintage: string | null;
	title: string;
	slug: string;
	text: string;
	food: string;
	stars: number | null;
	starDescription: string;
	storageDescription: string;
	valueDescription: string;
	publishedAt: string | null;
	fetchedAt: string;
};

export type ProductWineReviews = {
	version: 1;
	sku: string;
	reviews: WineReview[];
};

export type WineReviewCollection = {
	version: 1;
	skus: string[];
	reviews: WineReview[];
};

export function reviewVintage(value: unknown): string | null {
	const text = String(value ?? '').trim();
	return /^(?:19|20)\d{2}$/.test(text) ? text : null;
}

export function isReviewSlug(value: unknown): value is string {
	return typeof value === 'string' && /^[\p{L}\p{N}_-]+$/u.test(value);
}

export function wineReviewUrl(slug: string): string {
	return `${VIINILEHTI_ORIGIN}/viinit/${encodeURIComponent(slug)}/`;
}

/** Read only validated, same-product records from the optional static sidecar. */
export function readProductWineReviews(value: unknown, sku: string): WineReview[] {
	if (!value || typeof value !== 'object') return [];
	const data = value as Partial<ProductWineReviews>;
	if (data.version !== 1 || data.sku !== sku || !Array.isArray(data.reviews)) return [];
	return data.reviews.filter((review): review is WineReview => {
		if (!review || typeof review !== 'object') return false;
		return (
			review.sku === sku &&
			typeof review.id === 'string' &&
			isReviewSlug(review.slug) &&
			(review.vintage === null || reviewVintage(review.vintage) === review.vintage) &&
			[
				'title',
				'text',
				'food',
				'starDescription',
				'storageDescription',
				'valueDescription',
				'fetchedAt'
			].every((key) => typeof review[key as keyof WineReview] === 'string') &&
			review.text.trim().length > 0 &&
			(review.stars === null ||
				(Number.isInteger(review.stars) && review.stars >= 1 && review.stars <= 5)) &&
			(review.publishedAt === null || /^\d{4}-\d{2}-\d{2}$/.test(review.publishedAt))
		);
	});
}

/** Validate the aggregate once before the review browser uses it. */
export function readWineReviewCollection(value: unknown): WineReviewCollection | null {
	if (!value || typeof value !== 'object') return null;
	const data = value as Partial<WineReviewCollection>;
	if (data.version !== 1 || !Array.isArray(data.skus) || !Array.isArray(data.reviews)) return null;
	if (!data.skus.every((sku) => typeof sku === 'string' && /^\d{6}$/.test(sku))) return null;
	const listed = new Set(data.skus);
	if (listed.size !== data.skus.length) return null;
	const actual = new Set<string>();
	const ids = new Set<string>();
	for (const review of data.reviews) {
		if (!review || typeof review !== 'object' || !listed.has(review.sku)) return null;
		if (
			readProductWineReviews({ version: 1, sku: review.sku, reviews: [review] }, review.sku)
				.length !== 1
		)
			return null;
		const key = `${review.sku}:${review.id}`;
		if (ids.has(key)) return null;
		ids.add(key);
		actual.add(review.sku);
	}
	if (actual.size !== listed.size) return null;
	return { version: 1, skus: data.skus, reviews: data.reviews };
}

/** Prefer the Alko vintage; otherwise show the newest available, with its vintage labeled in the UI. */
export function selectWineReview(reviews: WineReview[], vintage: unknown): WineReview | undefined {
	const current = reviewVintage(vintage);
	return [...reviews].sort((a, b) => {
		const exactA = current !== null && a.vintage === current ? 1 : 0;
		const exactB = current !== null && b.vintage === current ? 1 : 0;
		return (
			exactB - exactA ||
			(b.vintage ?? '').localeCompare(a.vintage ?? '') ||
			(b.publishedAt ?? '').localeCompare(a.publishedAt ?? '')
		);
	})[0];
}

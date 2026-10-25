import { displayImageUrl } from '$lib/utils/catalog/alko';

const PRODUCT_PATH = /\/tuotteet\/(\d+)\/?$/;

/** Photos already requested; also keeps the images referenced until they've loaded */
const requested = new Map<string, HTMLImageElement>();

/**
 * Starts downloading the product page's main photo ahead of the visit. The request has the same
 * settings as ProductImage's (CORS, no referrer), so the product page reuses the download.
 */
export function prefetchProductImage(number: string) {
	if (requested.has(number)) return;
	// Data saver users opt out of speculative downloads
	if ((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData)
		return;
	const image = new Image();
	image.crossOrigin = 'anonymous';
	image.referrerPolicy = 'no-referrer';
	image.fetchPriority = 'low';
	image.src = displayImageUrl(number, 'medium');
	requested.set(number, image);
}

function linkedProductNumber(event: Event) {
	const link = (event.target as Element | null)?.closest?.('a');
	return link ? PRODUCT_PATH.exec(link.pathname)?.[1] : undefined;
}

/** How long the pointer rests on a link before it counts as interest, so sweeping over a list is free */
const HOVER_DELAY_MS = 120;
let hoverTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Prefetches the photo of the product a link points to once the pointer rests on it. One listener
 * covers every product link.
 */
export function prefetchOnHover(event: Event) {
	clearTimeout(hoverTimer);
	const number = linkedProductNumber(event);
	if (number) hoverTimer = setTimeout(() => prefetchProductImage(number), HOVER_DELAY_MS);
}

/** Prefetches at once when a press or touch starts on a product link, a head start of the tap */
export function prefetchOnPress(event: Event) {
	clearTimeout(hoverTimer);
	const number = linkedProductNumber(event);
	if (number) prefetchProductImage(number);
}

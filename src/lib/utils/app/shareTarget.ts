/** A product page link from Alko in any language (`/fi/tuotteet/319027/…`) or from Alkometriikka */
const PRODUCT_LINK = /\/(?:tuotteet|products|produkter)\/(\d+)/i;
const LINK = /https?:\/\/\S+/g;
/** The site name browsers append to a shared page's title, e.g. "Koskenkorva Viina | Alko" */
const SITE_SUFFIX = /\s+[|–-]\s+(?:Alko|Alkometriikka)$/i;

/** What another app hands over when it shares to the installed app (the manifest's share_target) */
export type SharedContent = {
	title?: string | null;
	text?: string | null;
	url?: string | null;
};

/**
 * Where shared content opens: the product it links to, otherwise a search for its words. Apps
 * disagree on which field holds what, so a link is looked for in all of them, and the link
 * itself is left out of the search.
 */
export function shareDestination({
	title,
	text,
	url
}: SharedContent): { productId: string } | { query: string } {
	for (const value of [url, text, title]) {
		const productId = value?.match(PRODUCT_LINK)?.[1];
		if (productId) return { productId };
	}
	const query = [text, title]
		.map((value) => value?.replace(LINK, '').replace(SITE_SUFFIX, '').trim())
		.find(Boolean);
	return { query: query ?? '' };
}

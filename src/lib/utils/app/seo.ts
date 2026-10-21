// Page copy shared by the client-side routes (setSEO) and the prerender scripts, so
// the static stubs crawlers see and the metadata set after hydration never drift apart.
// Kept free of `$lib` imports so the scripts can import it. The text is in messages/*.json:
// the scripts use the Finnish default, the app passes the visitor's language.
import { m } from '../../paraglide/messages.js';
import type { Locale } from '../../paraglide/runtime.js';
import { INTL_TAGS } from '../../i18n/tags';

const number = (locale: Locale, value: number, maxDigits: number, minDigits = 0) =>
	value.toLocaleString(INTL_TAGS[locale], {
		minimumFractionDigits: minDigits,
		maximumFractionDigits: maxDigits
	});

export type ProductSeoInput = {
	name: string;
	category?: string;
	volume?: number | null;
	alcoholPercentage?: number | null;
	price?: number | null;
	pricePerLitre?: number | null;
};

// Same constants as the app's calculator (src/lib/utils/alko.ts)
const ETHANOL_DENSITY = 789; // g/l
const SERVING_GRAMS = 12;

/** Price of one 12 g serving, or null when it can't be computed (e.g. alcohol-free) */
export function pricePerServing(input: ProductSeoInput): number | null {
	const { volume, alcoholPercentage, price } = input;
	if (!volume || volume <= 0 || !alcoholPercentage || alcoholPercentage <= 0) return null;
	if (!price || price <= 0) return null;
	const servings = (volume * (alcoholPercentage / 100) * ETHANOL_DENSITY) / SERVING_GRAMS;
	return Number.isFinite(servings) && servings > 0 ? price / servings : null;
}

/** "Koskenkorva Vodka: 40 % · 0,7 l · 12,99 € (18,56 €/l) · 0,70 €/annos · Viinat / Vodkat. Vertaa…" */
export function productDescription(input: ProductSeoInput, locale: Locale = 'fi'): string {
	const price = input.price && input.price > 0 ? `${number(locale, input.price, 2, 2)} €` : '';
	const servingPrice = pricePerServing(input);
	const facts = [
		input.alcoholPercentage && input.alcoholPercentage > 0
			? `${number(locale, input.alcoholPercentage, 1)} %`
			: '',
		input.volume && input.volume > 0 ? `${number(locale, input.volume, 3)} l` : '',
		price && input.pricePerLitre && input.pricePerLitre > 0
			? `${price} (${number(locale, input.pricePerLitre, 2, 2)} €/l)`
			: price,
		servingPrice !== null
			? m.seo_per_serving({ price: `${number(locale, servingPrice, 2, 2)} €` }, { locale })
			: '',
		input.category ?? ''
	].filter(Boolean);
	return facts.length
		? m.seo_product_description({ name: input.name, facts: facts.join(' · ') }, { locale })
		: m.seo_product_description_short({ name: input.name }, { locale });
}

export type StoreSeoInput = {
	name: string;
	address?: string;
	postalCode?: string;
	postOffice?: string;
	/** Preferred over the upper-cased postOffice when present */
	city?: string;
};

export function storeAddress(store: StoreSeoInput): string {
	return [
		store.address,
		[store.postalCode, store.city || store.postOffice].filter(Boolean).join(' ')
	]
		.filter(Boolean)
		.join(', ');
}

export function storeDescription(store: StoreSeoInput, locale: Locale = 'fi'): string {
	const address = storeAddress(store);
	return m.seo_store_description(
		{ store: address ? `${store.name}, ${address}` : store.name },
		{ locale }
	);
}

export type StaticPageSeo = {
	/** Route path with trailing slash */
	path: string;
	title: string;
	description: string;
	keywords?: string;
};

/** The front page. Its stub gives every `/?filters…` variant a canonical pointing back to `/`. */
export const HOME_PAGE = {
	path: '/',
	title: 'Alkometriikka',
	description: m.seo_home_description({}, { locale: 'fi' }),
	keywords: m.seo_home_keywords({}, { locale: 'fi' })
} satisfies StaticPageSeo;

type Message = (inputs: Record<string, never>, options: { locale: Locale }) => string;

type StaticPageSource = Pick<StaticPageSeo, 'path' | 'title'> & {
	description: Message;
	keywords: Message;
};

const STATIC_PAGE_SOURCES: StaticPageSource[] = [
	{
		path: '/laskin/',
		title: 'Laskin',
		description: m.seo_calculator_description,
		keywords: m.seo_calculator_keywords
	},
	{
		path: '/tilastot/',
		title: 'Tilastot',
		description: m.seo_stats_description,
		keywords: m.seo_stats_keywords
	},
	{
		path: '/myymalat/',
		title: 'Myymälät',
		description: m.seo_stores_description,
		keywords: m.seo_stores_keywords
	},
	{
		path: '/kompassi/',
		title: 'Kompassi',
		description: m.seo_compass_description,
		keywords: m.seo_compass_keywords
	},
	{
		path: '/hinnanmuutokset/',
		title: 'Hinnanmuutokset',
		description: m.seo_price_changes_description,
		keywords: m.seo_price_changes_keywords
	},
	{
		path: '/listat/',
		title: 'Listat',
		description: m.seo_lists_description,
		keywords: m.seo_lists_keywords
	}
];

const localizedPage = (page: StaticPageSource, locale: Locale): StaticPageSeo => ({
	path: page.path,
	title: page.title,
	description: page.description({}, { locale }),
	keywords: page.keywords({}, { locale })
});

/** Routes that are plain client-rendered pages, each given a prerendered stub. */
export const STATIC_PAGES: StaticPageSeo[] = STATIC_PAGE_SOURCES.map((page) =>
	localizedPage(page, 'fi')
);

export function staticPage(path: string, locale: Locale = 'fi'): StaticPageSeo {
	const page = STATIC_PAGE_SOURCES.find((entry) => entry.path === path);
	if (!page) throw new Error(`Unknown static page: ${path}`);
	return localizedPage(page, locale);
}

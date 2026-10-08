// Page copy shared by the client-side routes (setSEO) and the prerender scripts, so
// the static stubs crawlers see and the metadata set after hydration never drift apart.
// Kept free of `$lib` imports so the scripts can import it.

const number = (value: number, maxDigits: number, minDigits = 0) =>
	value.toLocaleString('fi-FI', {
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

/** "Koskenkorva Vodka: 40 % · 0,7 l · 12,99 € (18,56 €/l) · Viinat / Vodkat. Vertaa…" */
export function productDescription(input: ProductSeoInput): string {
	const price = input.price && input.price > 0 ? `${number(input.price, 2, 2)} €` : '';
	const facts = [
		input.alcoholPercentage && input.alcoholPercentage > 0
			? `${number(input.alcoholPercentage, 1)} %`
			: '',
		input.volume && input.volume > 0 ? `${number(input.volume, 3)} l` : '',
		price && input.pricePerLitre && input.pricePerLitre > 0
			? `${price} (${number(input.pricePerLitre, 2, 2)} €/l)`
			: price,
		input.category ?? ''
	].filter(Boolean);
	return `${input.name}${facts.length ? `: ${facts.join(' · ')}` : ''}. Vertaa hintoja ja vastaavia tuotteita Alkometriikassa.`;
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

export function storeDescription(store: StoreSeoInput): string {
	const address = storeAddress(store);
	return `Alkon myymälä ${store.name}${address ? `, ${address}` : ''}. Katso aukioloajat, osoite ja valikoima Alkometriikasta!`;
}

export type StaticPageSeo = {
	/** Route path with trailing slash */
	path: string;
	title: string;
	description: string;
	keywords?: string;
};

export const PRICE_CHANGES_DESCRIPTION =
	'Alkon tuotteiden viimeisimmät hinnanmuutokset: mitkä tuotteet halpenivat ja mitkä kallistuivat. Rajaa tyypin, myymälän ja aikavälin mukaan.';

/** Routes that are plain client-rendered pages, each given a prerendered stub. */
export const STATIC_PAGES: StaticPageSeo[] = [
	{
		path: '/laskin/',
		title: 'Laskin',
		description: 'Laske juoman alkoholimäärä, annokset ja promillearvio omilla arvoillasi.',
		keywords: 'laskin, promillelaskuri, alkoholi, annokset'
	},
	{
		path: '/tilastot/',
		title: 'Tilastot',
		description: 'Alkon valikoima numeroina ja kuvaajina.',
		keywords: 'tilastot, kuvaajat, hinnat, alkoholi'
	},
	{
		path: '/myymalat/',
		title: 'Myymälät',
		description: 'Selaa Alkon myymälöitä ja valitse ensisijainen myymälä.',
		keywords: 'Alko, myymälät, myymälä, aukioloajat, osoite, valikoima'
	},
	{
		path: '/kompassi/',
		title: 'Kompassi',
		description: 'Löydä lähin Alko kompassin avulla.',
		keywords: 'Alko, kompassi, lähin myymälä'
	},
	{
		path: '/hinnanmuutokset/',
		title: 'Hinnanmuutokset',
		description: PRICE_CHANGES_DESCRIPTION,
		keywords: 'hinnanmuutokset, hinnanalennukset, hinnankorotukset, Alko, hinnat'
	}
];

export function staticPage(path: string): StaticPageSeo {
	const page = STATIC_PAGES.find((entry) => entry.path === path);
	if (!page) throw new Error(`Unknown static page: ${path}`);
	return page;
}

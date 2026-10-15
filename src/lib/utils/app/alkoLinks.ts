import { locale, type Locale } from '$lib/i18n';

const ALKO_BASE = 'https://www.alko.fi';

const PRODUCT_PATHS: Record<Locale, string> = {
	fi: '/tuotteet',
	en: '/en/products',
	sv: '/sv/produkter'
};

const STORE_PATHS: Record<Locale, string> = {
	fi: '/myymalat-palvelut',
	en: '/en/stores-services',
	sv: '/sv/butiker-tjanster'
};

/** The product's page on alko.fi, in the current language. */
export function alkoProductUrl(productNumber: string): string {
	return `${ALKO_BASE}${PRODUCT_PATHS[locale]}/${productNumber}`;
}

/** The store's page on alko.fi, in the current language. */
export function alkoStoreUrl(storeId: string): string {
	return `${ALKO_BASE}${STORE_PATHS[locale]}/${storeId}`;
}

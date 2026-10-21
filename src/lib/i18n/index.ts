import { getLocale, locales, setLocale, type Locale } from '$lib/paraglide/runtime';
import { INTL_TAGS } from './tags';

export { m } from '$lib/paraglide/messages';
export { locales, setLocale, type Locale };

/**
 * The language of this page load. Switching languages reloads the page (see `setLocale`), so
 * it never changes while the app runs and can be read once.
 */
export const locale: Locale = getLocale();

/** BCP 47 tag of the current language, for `Intl` formatters and `toLocaleString`. */
export const intlLocale = INTL_TAGS[locale];

/** Each language's name in that language, for the language picker. */
export const LOCALE_NAMES: Record<Locale, string> = { fi: 'Suomi', en: 'English', sv: 'Svenska' };

/** The first language in the browser's preferences that the app has, other than Finnish. */
export function suggestedLocale(): Locale | undefined {
	for (const tag of navigator.languages ?? [navigator.language]) {
		const language = tag?.split('-')[0]?.toLowerCase();
		if (language === 'fi') return undefined;
		if (locales.includes(language as Locale)) return language as Locale;
	}
	return undefined;
}

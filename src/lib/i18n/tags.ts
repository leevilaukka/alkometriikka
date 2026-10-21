// Kept free of `$lib` imports so the scripts and src/lib/utils/app/seo.ts can import it.
import type { Locale } from '../paraglide/runtime.js';

/**
 * Tags for `Intl` formatting. English uses the British conventions (day-month dates, 24-hour
 * times), which match how Finnish visitors read them; Swedish uses Finland's Swedish.
 */
export const INTL_TAGS: Record<Locale, string> = { fi: 'fi-FI', en: 'en-GB', sv: 'sv-FI' };

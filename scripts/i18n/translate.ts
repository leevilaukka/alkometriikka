/**
 * Dataset value translations for scripts, read from the `labels.<language>.json` files that
 * labels.ts writes. The app's own lookup (src/lib/i18n/values.ts) follows the visitor's
 * language; scripts pick a language per output, e.g. the English aggregate feeds.
 */
import { labelKey } from './pairing.ts';

export { INTL_TAGS } from '../../src/lib/i18n/tags.ts';

export type Language = 'fi' | 'en' | 'sv';

export type Translator = {
	language: Language;
	/** A Finnish dataset value (category, country…) in this language, or as is. */
	value(value: string): string;
	/** A product's name in this language, or the Finnish one. */
	name(productId: string, finnish: string): string;
};

export const FINNISH: Translator = {
	language: 'fi',
	value: (value) => value,
	name: (_, finnish) => finnish
};

/** Keeps the source's leading capital, like the app does. */
function matchCase(source: string, translated: string): string {
	const first = source.trimStart().charAt(0);
	return first && first !== first.toLowerCase()
		? translated.charAt(0).toUpperCase() + translated.slice(1)
		: translated;
}

/** The translator for `language`, or null when its labels file is missing or broken. */
export async function loadTranslator(
	language: Exclude<Language, 'fi'>,
	path: string
): Promise<Translator | null> {
	try {
		const file = (await Bun.file(path).json()) as {
			labels?: Record<string, string>;
			names?: Record<string, string>;
		};
		const labels = file.labels ?? {};
		const names = file.names ?? {};
		return {
			language,
			value: (value) => {
				const translated = labels[labelKey(value)];
				return translated ? matchCase(value, translated) : value;
			},
			name: (productId, finnish) => names[productId] ?? finnish
		};
	} catch {
		return null;
	}
}

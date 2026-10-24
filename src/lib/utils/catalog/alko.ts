import type { DrunkColumnNames, ImageTransform, PriceListItem } from '$lib/types';
import { AllColumns, DrunkColumns } from '../constants/columns';
import { GenderOptionsMap } from '../constants/app';

/** Etanolin tiheys g/l */
export const ETHANOL_DENSITY = 789;

/** Suomalainen vakioannos, 12 g puhdasta alkoholia */
export const SERVING_GRAMS = 12;

/**
 * Laskee alkoholin määrän, känni per euro ja BAC-arvot.
 *
 * @param volume Pullon koko litroina (esim. 0.5)
 * @param percentage Alkoholiprosentti (esim. 5 → 5%)
 * @param price Pullon hinta euroina
 * @param weight Käyttäjän paino kiloina
 * @param gender Käyttäjän sukupuoli
 * @param itemName Tuotteen nimi (valinnainen, käytetään virheilmoituksissa)
 * @returns Olio, jossa puhtaan alkoholin määrä, alkoholia per euro, arvioitu BAC ja BAC per euro
 */
export function calculateDrunkValue(
	volume: number,
	percentage: number,
	price: number,
	gender: (typeof GenderOptionsMap)[keyof typeof GenderOptionsMap] = GenderOptionsMap.Unspecified,
	weight?: number,
	itemName?: string
): Record<DrunkColumnNames, number> {
	if (!weight) {
		if (gender === GenderOptionsMap.Female) {
			weight = 76; // Oletuspaino naisille
		} else if (gender === GenderOptionsMap.Male) {
			weight = 86; // Oletuspaino miehille
		} else {
			weight = 79; // Oletuspaino, jos sukupuolta ei ole määritetty
		}
	}

	// Widmarkin kertoimet
	const r = gender === GenderOptionsMap.Male ? 0.68 : 0.55;

	// Lasketaan puhtaan alkoholin määrä grammoina
	const pureAlcoholGrams = volume * (percentage / 100) * ETHANOL_DENSITY;

	// Lasketaan alkoholia grammoina per euro
	const alcoholPerEuro = price > 0 && Number.isFinite(price) ? pureAlcoholGrams / price : 0;

	// Lasketaan arvioitu BAC (‰) ja estetään negatiiviset arvot (ei negatiivista promillea)
	const estimatedBACRaw = pureAlcoholGrams / (weight * r);
	const estimatedBAC = Number.isFinite(estimatedBACRaw) ? Math.max(0, estimatedBACRaw) : 0;

	// Lasketaan promillea per euro (ei jaeta nollalla)
	const bacPerEuro =
		price > 0 && Number.isFinite(price) && Number.isFinite(estimatedBAC) ? estimatedBAC / price : 0;

	// Lasketaan annokset (1 annos = 12g)
	const servings = pureAlcoholGrams / SERVING_GRAMS;

	// Lasketaan hinta per annos (alkoholittomalla ei annoksia, joten 0)
	const euroPerServing = servings > 0 && Number.isFinite(price) ? price / servings : 0;

	// € per litra raakaa alkoholia (varmistetaan, että nimittäjä ei ole nolla)
	const alcoholLiters = volume * (percentage / 100);
	const euroPerLiter =
		alcoholLiters > 0 && Number.isFinite(alcoholLiters) && Number.isFinite(price)
			? price / alcoholLiters
			: 0;

	if (
		!Number.isFinite(pureAlcoholGrams) ||
		!Number.isFinite(alcoholPerEuro) ||
		!Number.isFinite(estimatedBAC) ||
		!Number.isFinite(bacPerEuro) ||
		!Number.isFinite(servings) ||
		!Number.isFinite(euroPerLiter) ||
		!Number.isFinite(euroPerServing)
	) {
		console.log(
			'Invalid input values. Please ensure volume, percentage, price, and weight are valid numbers., Item: ' +
				(itemName || 'Unknown') +
				', Volume: ' +
				volume +
				', Percentage: ' +
				percentage +
				', Price: ' +
				price +
				', Weight: ' +
				weight
		);
	}

	return {
		[DrunkColumns.AlcoholGrams]: parseFloat(pureAlcoholGrams.toFixed(2)),
		[DrunkColumns.AlcoholGramsPerEuro]: parseFloat(alcoholPerEuro.toFixed(2)),
		[DrunkColumns.EstimatedPromille]: parseFloat(estimatedBAC.toFixed(3)),
		[DrunkColumns.PromillePerEuro]: parseFloat(bacPerEuro.toFixed(4)),
		[DrunkColumns.Servings]: parseFloat(servings.toFixed(1)),
		[DrunkColumns.EuroPerLiterAlcohol]: parseFloat(euroPerLiter.toFixed(2)),
		[DrunkColumns.EuroPerServing]: parseFloat(euroPerServing.toFixed(2))
	};
}

/**
 * Price per litre the way Alko calculates it: the deposit is part of the price
 * but not of the litre price. For products the dataset has no `Litrahinta` for
 * (Alko leaves it out until a product is on sale).
 *
 * @returns The litre price rounded to cents, or `null` without a price and a size.
 */
export function calculatePricePerLitre(
	price: unknown,
	volume: unknown,
	deposit?: unknown
): number | null {
	if (typeof price !== 'number' || !(price > 0)) return null;
	if (typeof volume !== 'number' || !(volume > 0)) return null;
	const depositEuros = typeof deposit === 'number' && deposit > 0 ? deposit : 0;
	const perLitre = (price - depositEuros) / volume;
	return perLitre > 0 ? Math.round(perLitre * 100) / 100 : null;
}

const ALKO_IMAGES = 'https://images.alko.fi/images' as const;

/**
 * A product photo as JPEG, or WebP for clients that accept it, converted to sRGB. For share
 * metadata, structured data and feeds, whose readers may not decode AVIF; the app itself shows
 * {@link displayImageUrl}.
 */
export function generateImageUrl(
	itemNumber: string,
	transform: Exclude<ImageTransform, 'small'> = 'products'
): string {
	return `${ALKO_IMAGES}/cs_srgb,f_auto,t_${transform}/cdn/${itemNumber}/kuva.jpg` as const;
}

/**
 * Alko's CDN serves only a fixed set of transform and format combinations (others are 404s), and
 * its `f_auto` never picks AVIF, so the format is named by the extension. Without `cs_srgb` the
 * photos keep their Adobe RGB profile, which browsers convert; it is far smaller than the sRGB one
 * `cs_srgb` embeds, so the small photos are about 40 % lighter. `t_pdp` is converted to sRGB already.
 */
const DISPLAY_IMAGES: Record<ImageTransform, string> = {
	products: 't_products/cdn/{id}/kuva.webp',
	small: 't_digipruuvi/cdn/{id}/kuva.webp',
	medium: 't_pdp/cdn/{id}/kuva.avif',
	large: 't_large/cdn/{id}/kuva.avif'
};

/**
 * The product photo the app shows. `medium` and `large` are AVIF, about 40 % smaller than {@link generateImageUrl}'s
 * WebP; browsers that can't decode it fall back to {@link fallbackImageUrl}.
 */
export function displayImageUrl(
	itemNumber: string,
	transform: ImageTransform = 'products'
): string {
	return `${ALKO_IMAGES}/${DISPLAY_IMAGES[transform].replace('{id}', itemNumber)}`;
}

/** The photo to show when {@link displayImageUrl}'s AVIF can't be decoded, e.g. Safari before 16 */
export function fallbackImageUrl(
	itemNumber: string,
	transform: ImageTransform
): string | undefined {
	return transform === 'medium' || transform === 'large'
		? generateImageUrl(itemNumber, transform)
		: undefined;
}

/**
 * Site path of the product's price-change RSS feed, or `undefined` when it has none.
 * Same rule as scripts/site/rss.ts: a product gets a feed once its price has changed.
 */
export function productFeedPath(product: PriceListItem): string | undefined {
	const history = product[AllColumns.History] ?? [];
	const changed = history.some(
		(entry, index) => index > 0 && entry.price !== history[index - 1].price
	);
	return changed ? `/rss/${encodeURIComponent(product[AllColumns.Number])}.xml` : undefined;
}

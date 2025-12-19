import type { DrunkColumnNames } from "$lib/types";
import { DrunkColumns, GenderOptionsMap} from "./constants";

/**
 * Laskee alkoholin määrän, känni per euro ja BAC-arvot.
 *
 * @param volume Pullon koko litroina (esim. 0.5)
 * @param percentage Alkoholiprosentti (esim. 5 → 5%)
 * @param price Pullon hinta euroina
 * @param weight Käyttäjän paino kiloina
 * @param gender Käyttäjän sukupuoli
 * @returns Olio, jossa puhtaan alkoholin määrä, alkoholia per euro, arvioitu BAC ja BAC per euro
 */
export function calculateDrunkValue(
	volume: number,
	percentage: number,
	price: number,
	gender: typeof GenderOptionsMap[keyof typeof GenderOptionsMap] = GenderOptionsMap.Unspecified,
	weight?: number
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

	// Etanolin tiheys g/l
	const ETHANOL_DENSITY = 789;

	// Widmarkin kertoimet
	const r = gender === GenderOptionsMap.Male ? 0.68 : 0.55;

	// Lasketaan puhtaan alkoholin määrä grammoina
	const pureAlcoholGrams = volume * (percentage / 100) * ETHANOL_DENSITY;

	// Lasketaan alkoholia grammoina per euro
	const alcoholPerEuro = pureAlcoholGrams / price;

	// Lasketaan arvioitu BAC (‰)
	const estimatedBAC = pureAlcoholGrams / (weight * r);

	// Lasketaan promillea per euro
	const bacPerEuro = estimatedBAC / price;

	// Lasketaan annokset (1 annos = 12g)
	const servings = pureAlcoholGrams / 12;

	// € per litra raakaa alkoholia
	const euroPerLiter = price / (volume * (percentage / 100));

	return {
		[DrunkColumns.AlcoholGrams]: parseFloat(pureAlcoholGrams.toFixed(2)),
		[DrunkColumns.AlcoholGramsPerEuro]: parseFloat(alcoholPerEuro.toFixed(2)),
		[DrunkColumns.EstimatedPromille]: parseFloat(estimatedBAC.toFixed(3)),
		[DrunkColumns.PromillePerEuro]: parseFloat(bacPerEuro.toFixed(4)),
		[DrunkColumns.Servings]: parseFloat(servings.toFixed(1)),
		[DrunkColumns.EuroPerLiterAlcohol]: parseFloat(euroPerLiter.toFixed(2))
	};
}

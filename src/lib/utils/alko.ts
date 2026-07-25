import type { DrunkColumnNames } from "$lib/types";
import { DrunkColumns, GenderOptionsMap} from "./constants";

/**
 * Calculates various metrics related to alcohol consumption based on the provided parameters.
 * The function computes the amount of pure alcohol in grams, the amount of alcohol per euro spent, an estimated blood alcohol concentration (BAC), BAC per euro, the number of servings, and the cost per liter of pure alcohol. 
 * 
 * TODO: Maybe implement a time-based BAC decay model to estimate BAC over time after consumption, taking into account the body's metabolism of alcohol. This would provide a more accurate representation of BAC levels at different time intervals post-consumption.
 * 
 * It uses Widmark's formula `BAC = (A / (W × r))` for estimating BAC and takes into account the:
 *
 * @param volume The volume of the alcoholic beverage in liters.
 * @param percentage The alcohol percentage of the beverage (e.g., 5 for 5%). This and the volume are used to calculate the amount of pure alcohol in grams (`A`).
 * @param price The price of the beverage in euros.
 * @param gender (`r`, 0.68 for men or 0.55 for women, the default / unspecified value is an average) The gender of the individual consuming the alcohol. Defaults to "Unspecified" if not provided.
 * @param weight (`W`) The weight of the individual in kilograms. If not provided, a default weight is used based on the specified gender
 * @param itemName The name of the alcoholic beverage, used for logging purposes in case of invalid input values.
 * @returns An object containing the calculated metrics, including pure alcohol in grams, alcohol per euro, estimated BAC, BAC per euro, number of servings, and cost per liter of pure alcohol.
 */
export function calculateDrunkValue(
	volume: number,
	percentage: number,
	price: number,
	gender: typeof GenderOptionsMap[keyof typeof GenderOptionsMap] = GenderOptionsMap.Unspecified,
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

	// Ethanol density in grams per liter (g/L)
	const ETHANOL_DENSITY = 789;

	// Widmark's formula for estimating BAC: BAC = (A / (W × r))
	const r = gender === GenderOptionsMap.Male ? 0.68 : 0.55;

	// Calculate the amount of pure alcohol in grams (A)
	const pureAlcoholGrams = volume * (percentage / 100) * ETHANOL_DENSITY;

	// Calculate the amount of alcohol per euro spent
	const alcoholPerEuro = pureAlcoholGrams / price;

	// Calculate the estimated blood alcohol concentration (BAC) using Widmark's formula
	const estimatedBAC = pureAlcoholGrams / (weight * r);

	// Calculate the BAC per euro
	const bacPerEuro = estimatedBAC / price;

	// Calculate the number of servings (1 serving = 12g)
	const servings = pureAlcoholGrams / 12;

	// € per liter of pure alcohol
	const euroPerLiter = price / (volume * (percentage / 100));

	if (isNaN(pureAlcoholGrams) || isNaN(alcoholPerEuro) || isNaN(estimatedBAC) || isNaN(bacPerEuro) || isNaN(servings) || isNaN(euroPerLiter)) {
		console.log("Invalid input values. Please ensure volume, percentage, price, and weight are valid numbers., Item: " + (itemName || "Unknown") + ", Volume: " + volume + ", Percentage: " + percentage + ", Price: " + price + ", Weight: " + weight);
	}

	return {
		[DrunkColumns.AlcoholGrams]: parseFloat(pureAlcoholGrams.toFixed(2)),
		[DrunkColumns.AlcoholGramsPerEuro]: parseFloat(alcoholPerEuro.toFixed(2)),
		[DrunkColumns.EstimatedPromille]: parseFloat(estimatedBAC.toFixed(3)),
		[DrunkColumns.PromillePerEuro]: parseFloat(bacPerEuro.toFixed(4)),
		[DrunkColumns.Servings]: parseFloat(servings.toFixed(1)),
		[DrunkColumns.EuroPerLiterAlcohol]: parseFloat(euroPerLiter.toFixed(2)),
	};
}

/**
 * GTIN (EAN/UPC) barcode numbers. Shared by the scanner and the api.alkometriikka.fi Worker
 * (workers/api), so keep it free of imports.
 */

/** GTIN-8, UPC-A (GTIN-12), EAN-13 and GTIN-14 */
const GTIN_LENGTHS = new Set([8, 12, 13, 14]);

/** True for a GTIN of a valid length whose last digit is the GS1 check digit of the rest */
export function isValidGtin(code: string): boolean {
	if (!/^\d+$/.test(code) || !GTIN_LENGTHS.has(code.length)) return false;
	let sum = 0;
	// Weights alternate 3, 1, 3, … from the digit next to the check digit leftwards
	for (let i = code.length - 2, weight = 3; i >= 0; i--, weight = 4 - weight) {
		sum += Number(code[i]) * weight;
	}
	return (10 - (sum % 10)) % 10 === Number(code[code.length - 1]);
}

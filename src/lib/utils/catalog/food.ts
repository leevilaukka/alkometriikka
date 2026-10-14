/**
 * Alko's food pairing symbols (`foodSymbolId` in the search API) and their
 * Finnish labels. The API only returns the ids, so the labels live here.
 *
 * Kept free of imports: the sync scripts use it too.
 */
export const FOOD_PAIRING_LABELS: Readonly<Record<string, string>> = Object.freeze({
	foodSymbol_Aperitiivi: 'Aperitiivi',
	foodSymbol_Ayriaiset: 'Äyriäiset',
	foodSymbol_Blinit: 'Blinit',
	foodSymbol_Grilliruoka: 'Grilliruoka',
	foodSymbol_Itamainen_ruoka: 'Itämainen ruoka',
	foodSymbol_Kana_kalkkuna: 'Kana ja kalkkuna',
	foodSymbol_Keitot: 'Keitot',
	foodSymbol_Lammas: 'Lammas',
	foodSymbol_Makea_jalkiruoka: 'Makea jälkiruoka',
	foodSymbol_Maksa: 'Maksa',
	foodSymbol_Marjat_ja_hedelmat: 'Marjat ja hedelmät',
	foodSymbol_Mausteiset_ja_lihaisat_makkarat: 'Mausteiset ja lihaisat makkarat',
	foodSymbol_Miedot_juustot: 'Miedot juustot',
	foodSymbol_Miedot_makkarat: 'Miedot makkarat',
	foodSymbol_Nautiskelujuoma: 'Nautiskelujuoma',
	foodSymbol_Nauta: 'Nauta',
	foodSymbol_Noutopoyta: 'Noutopöytä',
	foodSymbol_Pasta_ja_pizza: 'Pasta ja pizza',
	foodSymbol_Pataruoka: 'Pataruoka',
	foodSymbol_Pikkusuolaiset: 'Pikkusuolaiset',
	foodSymbol_Porsas: 'Porsas',
	foodSymbol_Rasvainen_kala: 'Rasvainen kala',
	foodSymbol_Riista: 'Riista',
	foodSymbol_Riistalinnut: 'Riistalinnut',
	foodSymbol_Salaatit_kasvisruoka: 'Salaatit ja kasvisruoka',
	foodSymbol_Seurustelujuoma: 'Seurustelujuoma',
	foodSymbol_Sienet: 'Sienet',
	foodSymbol_Simpukat_ja_osterit: 'Simpukat ja osterit',
	foodSymbol_Suklaaherkut: 'Suklaaherkut',
	foodSymbol_Sushi: 'Sushi',
	foodSymbol_Tapas_ja_antipasti: 'Tapas ja antipasti',
	foodSymbol_Tulinen_ruoka: 'Tulinen ruoka',
	foodSymbol_Vaharasvainen_kala: 'Vähärasvainen kala',
	foodSymbol_Voimakkaat_juustot: 'Voimakkaat juustot'
});

/** Finnish label for a food symbol id. Unknown ids fall back to a readable form of the id. */
export function foodPairingLabel(id: string): string {
	const known = FOOD_PAIRING_LABELS[id];
	if (known) return known;
	const readable = id
		.replace(/^foodSymbol_/, '')
		.replace(/_/g, ' ')
		.trim();
	return readable.charAt(0).toUpperCase() + readable.slice(1);
}

/**
 * Turns the search API's `foodSymbolId` list into the stored column value:
 * the labels joined with ", ", the separator the app splits set columns on.
 */
export function formatFoodPairings(ids: unknown): string | null {
	if (!Array.isArray(ids)) return null;
	const labels = [
		...new Set(
			ids
				.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
				.map((id) => foodPairingLabel(id.trim()))
		)
	];
	return labels.length ? labels.join(', ') : null;
}

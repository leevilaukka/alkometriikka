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

/**
 * Alko's English and Swedish names for the food pairing symbols, from its own product pages
 * (the API has none). Used by scripts/i18n/labels.ts for the value translation files.
 */
export const FOOD_PAIRING_TRANSLATIONS: Readonly<
	Record<'en' | 'sv', Readonly<Record<string, string>>>
> = Object.freeze({
	en: Object.freeze({
		foodSymbol_Aperitiivi: 'Aperitif',
		foodSymbol_Ayriaiset: 'Seafood',
		foodSymbol_Blinit: 'Blini',
		foodSymbol_Grilliruoka: 'Grilled food',
		foodSymbol_Itamainen_ruoka: 'Oriental food',
		foodSymbol_Kana_kalkkuna: 'Chicken and turkey',
		foodSymbol_Keitot: 'Soups',
		foodSymbol_Lammas: 'Mutton, lamb',
		foodSymbol_Makea_jalkiruoka: 'Sweet desserts',
		foodSymbol_Maksa: 'Liver',
		foodSymbol_Marjat_ja_hedelmat: 'Berries and fruits',
		foodSymbol_Mausteiset_ja_lihaisat_makkarat: 'Spicy and meaty sausages',
		foodSymbol_Miedot_juustot: 'Mild cheeses',
		foodSymbol_Miedot_makkarat: 'Mild sausages',
		foodSymbol_Nauta: 'Beef',
		foodSymbol_Nautiskelujuoma: 'Meditation beverage',
		foodSymbol_Noutopoyta: 'Buffet',
		foodSymbol_Pasta_ja_pizza: 'Pasta and pizza',
		foodSymbol_Pataruoka: 'Casseroles',
		foodSymbol_Pikkusuolaiset: 'Savoury snacks',
		foodSymbol_Porsas: 'Pork',
		foodSymbol_Rasvainen_kala: 'Fatty fish',
		foodSymbol_Riista: 'Game',
		foodSymbol_Riistalinnut: 'Game birds',
		foodSymbol_Salaatit_kasvisruoka: 'Salads & vegetarian food',
		foodSymbol_Seurustelujuoma: 'Party wine',
		foodSymbol_Sienet: 'Mushrooms',
		foodSymbol_Simpukat_ja_osterit: 'Clams, mussels, scallops and oysters',
		foodSymbol_Suklaaherkut: 'Chocolate desserts',
		foodSymbol_Sushi: 'Sushi',
		foodSymbol_Tapas_ja_antipasti: 'Tapas and antipasti',
		foodSymbol_Tulinen_ruoka: 'Hot food',
		foodSymbol_Vaharasvainen_kala: 'Lean fish',
		foodSymbol_Voimakkaat_juustot: 'Strong cheeses'
	}),
	sv: Object.freeze({
		foodSymbol_Aperitiivi: 'Aperitif',
		foodSymbol_Ayriaiset: 'Skaldjur',
		foodSymbol_Blinit: 'Blinier',
		foodSymbol_Grilliruoka: 'Grillrätter',
		foodSymbol_Itamainen_ruoka: 'Orientalisk mat',
		foodSymbol_Kana_kalkkuna: 'Kyckling och kalkon',
		foodSymbol_Keitot: 'Soppor',
		foodSymbol_Lammas: 'Lamm',
		foodSymbol_Makea_jalkiruoka: 'Söta desserter',
		foodSymbol_Maksa: 'Lever',
		foodSymbol_Marjat_ja_hedelmat: 'Bär och frukt',
		foodSymbol_Mausteiset_ja_lihaisat_makkarat: 'Kryddiga och köttiga korvar',
		foodSymbol_Miedot_juustot: 'Milda ostar',
		foodSymbol_Miedot_makkarat: 'Milda korvar',
		foodSymbol_Nauta: 'Nöt',
		foodSymbol_Nautiskelujuoma: 'Gosdryck',
		foodSymbol_Noutopoyta: 'Buffé',
		foodSymbol_Pasta_ja_pizza: 'Pasta och pizza',
		foodSymbol_Pataruoka: 'Gryträtter',
		foodSymbol_Pikkusuolaiset: 'Salta tilltugg',
		foodSymbol_Porsas: 'Gris',
		foodSymbol_Rasvainen_kala: 'Fet fisk',
		foodSymbol_Riista: 'Vilt',
		foodSymbol_Riistalinnut: 'Skogsfågel',
		foodSymbol_Salaatit_kasvisruoka: 'Sallader & vegetarisk mat',
		foodSymbol_Seurustelujuoma: 'Sällskapsdryck',
		foodSymbol_Sienet: 'Svamp',
		foodSymbol_Simpukat_ja_osterit: 'Musslor och ostron',
		foodSymbol_Suklaaherkut: 'Chokladdesserter',
		foodSymbol_Sushi: 'Sushi',
		foodSymbol_Tapas_ja_antipasti: 'Tapas och antipasti',
		foodSymbol_Tulinen_ruoka: 'Kryddstark mat',
		foodSymbol_Vaharasvainen_kala: 'Mager fisk',
		foodSymbol_Voimakkaat_juustot: 'Starka ostar'
	})
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

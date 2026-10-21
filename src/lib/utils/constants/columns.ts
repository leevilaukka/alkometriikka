import type { ColNameObj, ColumnNames } from '$lib/types';

/** Columns present in the Alko price list dataset
 * These are in Finnish as they are used directly from the dataset
 * and shown in the UI with the names in `columnDisplayNames`.
 *
 * Do not change these values unless the dataset changes.
 * In that case, update the values accordingly
 */
export const DatasetColumns = Object.freeze({
	Number: 'Numero',
	Name: 'Nimi',
	Manufacturer: 'Valmistaja',
	BottleSize: 'Pullokoko',
	Price: 'Hinta',
	PricePerLiter: 'Litrahinta',
	New: 'Uutuus',
	SortingCode: 'Hinnastojärjestyskoodi',
	Type: 'Tyyppi',
	SubType: 'Alatyyppi',
	SpecialGroup: 'Erityisryhmä',
	BeerType: 'Oluttyyppi',
	Country: 'Valmistusmaa',
	Region: 'Alue',
	Vintage: 'Vuosikerta',
	LabelInfo: 'Etikettimerkintöjä',
	Note: 'Huomautus',
	GrapeVarieties: 'Rypäleet',
	Description: 'Luonnehdinta',
	PackagingType: 'Pakkaustyyppi',
	SealingType: 'Suljentatyyppi',
	AlcoholPercentage: 'Alkoholi-%',
	Acidity: 'Hapot g/l',
	Sugar: 'Sokeri g/l',
	OriginalGravity: 'Kantavierrep-%',
	ColorEBC: 'Väri EBC',
	BitternessEBU: 'Katkerot EBU',
	Energy: 'Energia kcal/100 ml',
	Availability: 'Valikoima',
	EAN: 'EAN',
	NormalPrice: 'Normaalihinta',
	CampaignStart: 'Kampanja alkaa',
	CampaignEnd: 'Kampanja päättyy',
	FoodPairings: 'Ruokasuositukset',
	Status: 'Tila',
	Deposit: 'Pantti',
	History: 'Hintahistoria',
	RemovedFromSelection: 'Poistunut valikoimasta'
} as const);

/** Columns related to calculated drunk values.
 * These are in Finnish as they are shown in the UI as-is
 */
export const DrunkColumns = Object.freeze({
	AlcoholGrams: 'Alkoholigrammat',
	AlcoholGramsPerEuro: 'Alkoholigrammat / €',
	EstimatedPromille: 'Arvioidut promillet',
	PromillePerEuro: 'Promillet / €',
	Servings: 'Annokset',
	EuroPerLiterAlcohol: '€ / l (alk.)'
} as const);

/** Column holding the per-store availability derived from availability.json.
 * Not part of the raw dataset - computed in Kaljakori from AvailabilityData.
 */
export const StoreColumns = Object.freeze({
	StoreAvailability: 'Myymälät'
} as const);

/** Columns derived from other dataset columns - not present in the raw price list.
 */
export const CalculatedColumns = Object.freeze({
	OnSale: 'Alennuksessa'
} as const);

/** All columns available in the app.
 * This is a combination of DatasetColumns, DrunkColumns, StoreColumns and CalculatedColumns
 */
export const AllColumns = Object.freeze({
	...DatasetColumns,
	...DrunkColumns,
	...StoreColumns,
	...CalculatedColumns
} as const);

/**
 * Mapping of subcategories for hierarchical filtering.
 */
export const subCategoryMap = {
	[DatasetColumns.Type]: DatasetColumns.SubType,
	[DatasetColumns.SubType]: DatasetColumns.BeerType,
	[DatasetColumns.Country]: DatasetColumns.Region
} as const satisfies ColNameObj<ColumnNames>;

// Columns that should be handled as strings rather than numbers or other types, even if they look numeric and could be cast to numbers.
export const columnsHandledAsString = [
	AllColumns.Number,
	AllColumns.Name,
	AllColumns.Manufacturer,
	AllColumns.EAN
] as const satisfies readonly ColumnNames[];

// Columns that should be handled as sets (arrays) rather than single values.
export const columnsHandledAsSet = [
	AllColumns.Description,
	AllColumns.SpecialGroup,
	AllColumns.Note,
	AllColumns.GrapeVarieties,
	AllColumns.FoodPairings,
	AllColumns.StoreAvailability
] as const satisfies readonly ColumnNames[];

// Columns where undefined values should be treated as zero. Doing this helps avoid NaN issues in calculations.
export const undefinedToZeroColumns = [
	AllColumns.Sugar,
	AllColumns.Acidity,
	AllColumns.OriginalGravity,
	AllColumns.BitternessEBU,
	AllColumns.Energy
] as const satisfies readonly ColumnNames[];

/**
 * Key for the set of columns that had no value in the dataset and were filled in by Kaljakori:
 * the {@link undefinedToZeroColumns} (so a filled in zero can be told apart from a real one) and a
 * `Litrahinta` calculated from the price. A symbol survives spreads but stays out of Object.keys.
 */
export const MissingValues = Symbol('missingValues');

/** Columns that are hidden from the product page statistics.
 * These are usually columns that are either not relevant for the product page
 * or are already shown prominently elsewhere on the page.
 */
export const hideFromProductPageStats = new Set<ColumnNames>([
	DatasetColumns.AlcoholPercentage,
	DatasetColumns.Manufacturer,
	DatasetColumns.SortingCode,
	DatasetColumns.BottleSize,
	DatasetColumns.Price,
	DatasetColumns.PricePerLiter,
	DatasetColumns.Name,
	DatasetColumns.Vintage,
	DatasetColumns.EAN,
	DatasetColumns.RemovedFromSelection,
	// The campaign/normal-price fields are shown around the price itself rather
	// than as raw perustiedot rows.
	DatasetColumns.NormalPrice,
	DatasetColumns.CampaignStart,
	DatasetColumns.CampaignEnd,
	// Shown as a row of links at the bottom of the table
	DatasetColumns.FoodPairings,
	// Shown as a badge, and the deposit next to the price
	DatasetColumns.Status,
	DatasetColumns.Deposit,
	// Hide Uutuus as it is currently kinda bugged and not very useful on the product page stats. It is still shown in the list view and can be used for filtering.
	DatasetColumns.New,
	DatasetColumns.History
]);

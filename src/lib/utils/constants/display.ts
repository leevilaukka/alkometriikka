import type { ColNameObj, ColumnNames, PriceListItem } from '$lib/types';
import { AllColumns } from './columns';
import { groupOptionsByWords, type OptionGrouper } from '$lib/utils/ui/optionGroups';

/**
 * Product rows the long lists render past each edge of the screen. Every keystroke in the search
 * re-renders them all, and each costs about 10 ms on a phone, so this stays small.
 */
export const LIST_BUFFER_SIZE = 6;

/**
 * The long lists' guess for a row not yet measured: no shorter than a product card ever is
 * (about 530 px stacked on phones, 240 px on wide screens). With the list's default of 40 px a
 * new result list seems to fit on screen, so being at its top also counts as being at its bottom,
 * and once the rows are measured the list keeps to the bottom, jumping to its end.
 */
export const LIST_ROW_ESTIMATE = 560;

/**
 * Keys the long lists' rows by product. A product still on screen after a search keeps its row
 * and photo instead of the row at its position re-rendering with another product, and the list
 * matches rows by key: keyed by position, it scrolls to keep the old top row in view, which after
 * a short result list means jumping to the end of the new one.
 */
export const productKey = (item: PriceListItem) => item[AllColumns.Number];

/**
 * Columns to be shown in the filter area.
 */
export const shownFilters = [
	AllColumns.Name,
	AllColumns.Manufacturer,
	AllColumns.Type,
	AllColumns.SubType,
	AllColumns.BottleSize,
	AllColumns.Price,
	AllColumns.Sugar,
	AllColumns.PackagingType,
	AllColumns.AlcoholPercentage,
	AllColumns.Country,
	AllColumns.Availability,
	AllColumns.StoreAvailability,
	AllColumns.Servings,
	AllColumns.PromillePerEuro,
	AllColumns.AlcoholGramsPerEuro,
	AllColumns.Description,
	AllColumns.Note,
	AllColumns.GrapeVarieties,
	AllColumns.FoodPairings,
	AllColumns.New,
	AllColumns.OnSale
] as const satisfies readonly ColumnNames[];

/** How the options of a string filter are grouped in its picker */
export const filterOptionGroupers: Partial<Record<ColumnNames, OptionGrouper>> = {
	// Stores by city and district, e.g. "Helsinki" → "keskusta" → "Arkadia"
	[AllColumns.StoreAvailability]: (options) => groupOptionsByWords(options)
};

/**
 * Filter annotations (AND / OR) used in the filter popups.
 */
const FilterAnnotations = {
	AND: {
		title: 'Kaikki valitut (JA)',
		description:
			'Näytä tuotteet, jotka täyttävät kaikki valitut ehdot.\nEsim. jos valitset kaksi rypälettä, näytetään vain tuotteet, joissa on molemmat rypäleet.',
		icon: 'list'
	},
	OR: {
		title: 'Jokin valituista (TAI)',
		description:
			'Näytä tuotteet, jotka täyttävät vähintään yhden valitun ehdon.\nEsim. jos valitset kaksi valmistajaa, näytetään kaikki molempien valmistajien tuotteet.',
		icon: 'list_plus'
	}
} as const;

const { AND, OR } = FilterAnnotations;

/**
 * Mapping from column names to their respective filter annotation (AND / OR).
 * @see FilterAnnotations
 */
export const filterAnnotationsToFilter = {
	[AllColumns.Name]: OR,
	[AllColumns.Type]: OR,
	[AllColumns.Manufacturer]: OR,
	[AllColumns.SubType]: OR,
	[AllColumns.Country]: OR,
	[AllColumns.PackagingType]: OR,
	[AllColumns.Region]: OR,
	[AllColumns.Availability]: OR,
	[AllColumns.StoreAvailability]: OR,
	[AllColumns.Description]: AND,
	[AllColumns.Note]: AND,
	[AllColumns.GrapeVarieties]: AND,
	[AllColumns.FoodPairings]: AND
} as const satisfies Partial<Record<ColumnNames, typeof AND | typeof OR>>;

/**
 * Keys to be shown in the sorting dropdown.
 */
export const shownSortingKeys = [
	AllColumns.AlcoholGramsPerEuro,
	AllColumns.Price,
	AllColumns.PricePerLiter,
	AllColumns.AlcoholGrams,
	AllColumns.BottleSize,
	AllColumns.Name,
	AllColumns.Manufacturer,
	AllColumns.Type,
	AllColumns.AlcoholPercentage,
	AllColumns.EstimatedPromille,
	AllColumns.Servings,
	AllColumns.Sugar,
	AllColumns.PromillePerEuro
] as const satisfies readonly ColumnNames[];

/** Descriptions for sorting order for different columns.
 * Used in the UI to show what "ascending" and "descending" mean for each column.
 */
export const sortingOrderDescriptionMap = {
	[AllColumns.AlcoholGramsPerEuro]: ['Matalin', 'Korkein'],
	[AllColumns.Price]: ['Halvin', 'Kallein'],
	[AllColumns.PricePerLiter]: ['Halvin', 'Kallein'],
	[AllColumns.AlcoholGrams]: ['Matalin', 'Korkein'],
	[AllColumns.BottleSize]: ['Pienin', 'Suurin'],
	[AllColumns.Name]: ['A-Ö', 'Ö-A'],
	[AllColumns.Manufacturer]: ['A-Ö', 'Ö-A'],
	[AllColumns.Type]: ['A-Ö', 'Ö-A'],
	[AllColumns.EstimatedPromille]: ['Matalin', 'Korkein'],
	[AllColumns.Servings]: ['Vähiten', 'Eniten'],
	[AllColumns.Sugar]: ['Matalin', 'Korkein'],
	[AllColumns.PromillePerEuro]: ['Matalin', 'Korkein']
} as const satisfies ColNameObj<[string, string]>;

/** Default sorting order for the columns.
 * true = ascending, false / undefined (default) = descending
 *
 * Ascending means:
 * - For numeric values: smallest to largest
 * - For string values: A to Z
 *
 * Descending means the opposite, as one would expect :)
 */
export const defaultSortingOrderMap = {
	[AllColumns.Name]: true,
	[AllColumns.Manufacturer]: true,
	[AllColumns.Type]: true,
	[AllColumns.Price]: true,
	[AllColumns.PricePerLiter]: true,
	[AllColumns.BottleSize]: true,
	[AllColumns.Sugar]: true
} as const satisfies ColNameObj<boolean>;

/**
 * Columns which value can be highlighted in the list view.
 * These are the options for the "Highlight" feature
 */
export const shownColumnsToHighlight = [
	AllColumns.AlcoholGramsPerEuro,
	AllColumns.Price,
	AllColumns.BottleSize,
	AllColumns.AlcoholPercentage,
	AllColumns.AlcoholGrams,
	AllColumns.EstimatedPromille,
	AllColumns.Servings,
	AllColumns.Sugar
] as const satisfies readonly ColumnNames[];

export const defaultSortingColumn = AllColumns.AlcoholGramsPerEuro;

/** Mapping of filters to their unit markers.
 * Used in the UI to show the unit next to the filter value
 */
export const filterToUnitMarker = {
	[AllColumns.Price]: '€',
	[AllColumns.PricePerLiter]: '€/L',
	[AllColumns.NormalPrice]: '€',
	[AllColumns.Deposit]: '€',
	[AllColumns.BottleSize]: 'L',
	[AllColumns.EstimatedPromille]: '‰',
	[AllColumns.AlcoholPercentage]: '%',
	[AllColumns.Sugar]: 'g/l',
	[AllColumns.AlcoholGrams]: 'g',
	[AllColumns.Acidity]: 'g/l',
	[AllColumns.Energy]: 'kcal/100ml',
	[AllColumns.BitternessEBU]: 'EBU',
	[AllColumns.OriginalGravity]: '°P',
	[AllColumns.ColorEBC]: 'EBC',
	[AllColumns.EuroPerLiterAlcohol]: '€',
	[AllColumns.PromillePerEuro]: '‰'
} as const satisfies ColNameObj<string>;

/**
 * Mapping of filter keys to their display names.
 * Used in the UI to show a more user-friendly name for the filter
 */
export const filterRenameMap = {
	[AllColumns.Type]: 'Kategoria',
	[AllColumns.SubType]: 'Tyyppi',
	[AllColumns.BeerType]: 'Maku',
	[AllColumns.BottleSize]: 'Pakkauskoko',
	[AllColumns.Sugar]: 'Sokeri',
	[AllColumns.AlcoholPercentage]: 'Alkoholi',
	[AllColumns.Acidity]: 'Hapot',
	[AllColumns.Energy]: 'Energia',
	[AllColumns.Description]: 'Kuvaus',
	[AllColumns.LabelInfo]: 'Etiketti',
	[AllColumns.GrapeVarieties]: 'Rypäleet',
	[AllColumns.OriginalGravity]: 'Kantavierre',
	[AllColumns.ColorEBC]: 'Väri',
	[AllColumns.BitternessEBU]: 'Katkeroaineet'
} as const satisfies ColNameObj<string>;

export const timeConfig: Intl.DateTimeFormatOptions = {
	hour: '2-digit',
	minute: '2-digit',
	timeZone: 'Europe/Helsinki'
};

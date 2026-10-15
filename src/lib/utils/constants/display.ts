import type { ColNameObj, ColumnNames } from '$lib/types';
import { m } from '$lib/i18n';
import { AllColumns } from './columns';

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

/**
 * Filter annotations (AND / OR) used in the filter popups.
 */
const FilterAnnotations = {
	AND: {
		title: m.filter_and_title(),
		description: m.filter_and_description(),
		icon: 'list'
	},
	OR: {
		title: m.filter_or_title(),
		description: m.filter_or_description(),
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
const lowestHighest = [m.sort_lowest(), m.sort_highest()] as const;
const cheapestPriciest = [m.sort_cheapest(), m.sort_priciest()] as const;
const alphabetical = [m.sort_a_to_z(), m.sort_z_to_a()] as const;

export const sortingOrderDescriptionMap = {
	[AllColumns.AlcoholGramsPerEuro]: lowestHighest,
	[AllColumns.Price]: cheapestPriciest,
	[AllColumns.PricePerLiter]: cheapestPriciest,
	[AllColumns.AlcoholGrams]: lowestHighest,
	[AllColumns.BottleSize]: [m.sort_smallest(), m.sort_largest()],
	[AllColumns.Name]: alphabetical,
	[AllColumns.Manufacturer]: alphabetical,
	[AllColumns.Type]: alphabetical,
	[AllColumns.EstimatedPromille]: lowestHighest,
	[AllColumns.Servings]: [m.sort_fewest(), m.sort_most()],
	[AllColumns.Sugar]: lowestHighest,
	[AllColumns.PromillePerEuro]: lowestHighest
} as const satisfies ColNameObj<readonly [string, string]>;

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
 * The name each column is shown with. The column names themselves are the dataset's Finnish
 * keys, which also appear in URLs, so they never change; these are the display names.
 */
export const columnDisplayNames = {
	[AllColumns.Number]: m.column_number(),
	[AllColumns.Name]: m.column_name(),
	[AllColumns.Manufacturer]: m.column_manufacturer(),
	[AllColumns.BottleSize]: m.column_bottle_size(),
	[AllColumns.Price]: m.column_price(),
	[AllColumns.PricePerLiter]: m.column_price_per_liter(),
	[AllColumns.New]: m.column_new(),
	[AllColumns.SortingCode]: m.column_sorting_code(),
	[AllColumns.Type]: m.column_type(),
	[AllColumns.SubType]: m.column_sub_type(),
	[AllColumns.SpecialGroup]: m.column_special_group(),
	[AllColumns.BeerType]: m.column_beer_type(),
	[AllColumns.Country]: m.column_country(),
	[AllColumns.Region]: m.column_region(),
	[AllColumns.Vintage]: m.column_vintage(),
	[AllColumns.LabelInfo]: m.column_label_info(),
	[AllColumns.Note]: m.column_note(),
	[AllColumns.GrapeVarieties]: m.column_grape_varieties(),
	[AllColumns.Description]: m.column_description(),
	[AllColumns.PackagingType]: m.column_packaging_type(),
	[AllColumns.SealingType]: m.column_sealing_type(),
	[AllColumns.AlcoholPercentage]: m.column_alcohol_percentage(),
	[AllColumns.Acidity]: m.column_acidity(),
	[AllColumns.Sugar]: m.column_sugar(),
	[AllColumns.OriginalGravity]: m.column_original_gravity(),
	[AllColumns.ColorEBC]: m.column_color_ebc(),
	[AllColumns.BitternessEBU]: m.column_bitterness_ebu(),
	[AllColumns.Energy]: m.column_energy(),
	[AllColumns.Availability]: m.column_availability(),
	[AllColumns.EAN]: m.column_ean(),
	[AllColumns.NormalPrice]: m.column_normal_price(),
	[AllColumns.CampaignStart]: m.column_campaign_start(),
	[AllColumns.CampaignEnd]: m.column_campaign_end(),
	[AllColumns.FoodPairings]: m.column_food_pairings(),
	[AllColumns.History]: m.column_history(),
	[AllColumns.RemovedFromSelection]: m.column_removed_from_selection(),
	[AllColumns.AlcoholGrams]: m.column_alcohol_grams(),
	[AllColumns.AlcoholGramsPerEuro]: m.column_alcohol_grams_per_euro(),
	[AllColumns.EstimatedPromille]: m.column_estimated_promille(),
	[AllColumns.PromillePerEuro]: m.column_promille_per_euro(),
	[AllColumns.Servings]: m.column_servings(),
	[AllColumns.EuroPerLiterAlcohol]: m.column_euro_per_liter_alcohol(),
	[AllColumns.StoreAvailability]: m.column_store_availability(),
	[AllColumns.OnSale]: m.column_on_sale()
} as const satisfies Record<ColumnNames, string>;

export const timeConfig: Intl.DateTimeFormatOptions = {
	hour: '2-digit',
	minute: '2-digit',
	timeZone: 'Europe/Helsinki'
};

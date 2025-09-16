import type { ColNameObj, ColumnNames } from "$lib/alko/types";


export const DatasetColumns = Object.freeze({
    Number: "Numero",
    Name: "Nimi",
    Manufacturer: "Valmistaja",
    BottleSize: "Pullokoko",
    Price: "Hinta",
    LitersPrice: "Litrahinta",
    New: "Uutuus",
    SortingCode: "Hinnastojärjestyskoodi",
    Type: "Tyyppi",
    SubType: "Alatyyppi",
    SpecialGroup: "Erityisryhmä",
    BeerType: "Oluttyyppi",
    Country: "Valmistusmaa",
    Region: "Alue",
    Vintage: "Vuosikerta",
    LabelInfo: "Etikettimerkintöjä",
    Note: "Huomautus",
    GrapeVarieties: "Rypäleet",
    Description: "Luonnehdinta",
    PackagingType: "Pakkaustyyppi",
    SealingType: "Suljentatyyppi",
    AlcoholPercentage: "Alkoholi-%",
    Acidity: "Hapot g/l",
    Sugar: "Sokeri g/l",
    OriginalGravity: "Kantavierrep-%",
    ColorEBC: "Väri EBC",
    BitternessEBU: "Katkerot EBU",
    Energy: "Energia kcal/100ml",
    Availability: "Valikoima",
    EAN: "EAN"
} as const);

export const DrunkColumns = Object.freeze({
    AlcoholGrams: "Alkoholigrammat",
    AlcoholGramsPerEuro: "Alkoholigrammat / €",
    EstimatedPromille: "Arvioidut promillet",
    PromillePerEuro: "Promillet / €",
    Servings: "Annokset"
} as const);

export const AllColumns = Object.freeze({ ...DatasetColumns, ...DrunkColumns } as const);


/**
 * Columns to be shown in the filter area.
 */
export const shownFilters = [
    AllColumns.Name,
    AllColumns.Manufacturer,
    AllColumns.Type,
    AllColumns.BottleSize,
    AllColumns.Price,
    AllColumns.Sugar,
    AllColumns.PackagingType,
    AllColumns.AlcoholPercentage,
    AllColumns.Country,
    AllColumns.Availability,
    AllColumns.Servings,
    AllColumns.PromillePerEuro,
    AllColumns.AlcoholGramsPerEuro,
] as const satisfies readonly ColumnNames[];

export const shownSortingKeys = [
    AllColumns.AlcoholGramsPerEuro,
    AllColumns.Price,
    AllColumns.LitersPrice,
    AllColumns.AlcoholGrams,
    AllColumns.BottleSize,
    AllColumns.Name,
    AllColumns.Manufacturer,
    AllColumns.Type,
    AllColumns.AlcoholPercentage,
    AllColumns.EstimatedPromille,
    AllColumns.Servings,
    AllColumns.Sugar,
    AllColumns.PromillePerEuro,
] as const satisfies readonly ColumnNames[];


/** Descriptions for sorting order for different columns.
 * Used in the UI to show what "ascending" and "descending" mean for each column.
 */
export const sortingOrderDescriptionMap = {
    [AllColumns.AlcoholGramsPerEuro]: ["Matalin", "Korkein"],
    [AllColumns.Price]: ["Halvin", "Kallein"],
    [AllColumns.LitersPrice]: ["Halvin", "Kallein"],
    [AllColumns.AlcoholGrams]: ["Matalinn", "Korkein"],
    [AllColumns.BottleSize]: ["Pienin", "Suurin"],
    [AllColumns.Name]: ["A-Ö", "Ö-A"],
    [AllColumns.Manufacturer]: ["A-Ö", "Ö-A"],
    [AllColumns.Type]: ["A-Ö", "Ö-A"],
    [AllColumns.EstimatedPromille]: ["Matalin", "Korkein"],
    [AllColumns.Servings]: ["Vähiten", "Eniten"],
    [AllColumns.Sugar]: ["Matalin", "Korkein"],
    [AllColumns.PromillePerEuro]: ["Matalin", "Korkein"],
} as const satisfies ColNameObj<[string, string]>;


/** Default sorting order for the columns.
 * true = ascending, false = descending
 *
 * Ascending means:
 * - For numeric values: smallest to largest
 * - For string values: A to Z
 * 
 * Descending means the opposite.
 */
export const defaultSortingOrderMap = {
    [AllColumns.Name]: true,
    [AllColumns.Manufacturer]: true,
    [AllColumns.Type]: true,
    [AllColumns.Price]: true,
    [AllColumns.LitersPrice]: true,
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
    AllColumns.Sugar,
] as const satisfies readonly ColumnNames[];

export const defaultSortingColumn: ColumnNames = AllColumns.AlcoholGramsPerEuro;

/** Mapping of filters to their unit markers.
 * Used in the UI to show the unit next to the filter value
 */
export const filterToUnitMarker = {
    [AllColumns.Price]: '€',
    [AllColumns.BottleSize]: 'L',
    [AllColumns.EstimatedPromille]: '‰',
    [AllColumns.AlcoholPercentage]: '%',
    [AllColumns.Sugar]: 'g/l',
    [AllColumns.AlcoholGrams]: 'g',
} as const satisfies ColNameObj<string>;

/**
 * Mapping of filter keys to their display names.
 * Used in the UI to show a more user-friendly name for the filter
 */
export const filterRenameMap = {
    [AllColumns.BottleSize]: 'Pakkauskoko',
    [AllColumns.Sugar]: 'Sokeri',
    [AllColumns.AlcoholPercentage]: 'Alkoholi',
} as const satisfies ColNameObj<string>;
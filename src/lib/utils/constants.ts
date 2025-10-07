import type { ColNameObj, ColumnNames } from "$lib/types";
import type { VariantProps } from "class-variance-authority";
import { components } from "./styles.js";
import type { IconName } from "$lib/icons.js";

/** Columns present in the Alko price list dataset
 * These are in Finnish as they are used directly from the dataset
 * and shown in the UI as-is or with minor modifications using `filterRenameMap`.
 *
 * Do not change these values unless the dataset changes.
 * In that case, update the values accordingly
 */
export const DatasetColumns = Object.freeze({
    Number: "Numero",
    Name: "Nimi",
    Manufacturer: "Valmistaja",
    BottleSize: "Pullokoko",
    Price: "Hinta",
    PricePerLiter: "Litrahinta",
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
    Energy: "Energia kcal/100 ml",
    Availability: "Valikoima",
    EAN: "EAN"
} as const);

/** Columns related to calculated drunk values.
 * These are in Finnish as they are shown in the UI as-is
 */
export const DrunkColumns = Object.freeze({
    AlcoholGrams: "Alkoholigrammat",
    AlcoholGramsPerEuro: "Alkoholigrammat / €",
    EstimatedPromille: "Arvioidut promillet",
    PromillePerEuro: "Promillet / €",
    Servings: "Annokset",
} as const);

/** All columns available in the app.
 * This is a combination of DatasetColumns and DrunkColumns
 */
export const AllColumns = Object.freeze({ ...DatasetColumns, ...DrunkColumns } as const);

export const subCategoryMap = {
    [DatasetColumns.Type]: DatasetColumns.SubType,
    [DatasetColumns.Country]: DatasetColumns.Region,
} as const satisfies ColNameObj<ColumnNames | null>;


export const undefinedToZeroColumns = [
    AllColumns.Sugar,
    AllColumns.Acidity,
    AllColumns.OriginalGravity,
    AllColumns.BitternessEBU,
    AllColumns.Energy
] as const satisfies readonly ColumnNames[];

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
    AllColumns.New
] as const satisfies readonly ColumnNames[];

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
    AllColumns.PromillePerEuro,
] as const satisfies readonly ColumnNames[];


/** Descriptions for sorting order for different columns.
 * Used in the UI to show what "ascending" and "descending" mean for each column.
 */
export const sortingOrderDescriptionMap = {
    [AllColumns.AlcoholGramsPerEuro]: ["Matalin", "Korkein"],
    [AllColumns.Price]: ["Halvin", "Kallein"],
    [AllColumns.PricePerLiter]: ["Halvin", "Kallein"],
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
    [AllColumns.Acidity]: 'g/l',
    [AllColumns.Energy]: 'kcal/100ml',
    [AllColumns.BitternessEBU]: 'EBU',
    [AllColumns.OriginalGravity]: '°P',
} as const satisfies ColNameObj<string>;

/**
 * Mapping of filter keys to their display names.
 * Used in the UI to show a more user-friendly name for the filter
 */
export const filterRenameMap = {
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
    [AllColumns.BitternessEBU]: 'Katkeroaineet',
} as const satisfies ColNameObj<string>;

/** Keys used for storing data in localStorage */
export const LocalStorageKeys = {
    PersonalInfo: "personal_info",
    Lists: "lists",
    ListsVersion: "lists_version",
    AppVersion: "app_version",
    CurrentFilters: "current_filters",
} as const;

/** Options for gender selection */
export const GenderOptionsMap = {
    Male: "Mies",
    Female: "Nainen",
    Unspecified: "Muu"
} as const satisfies { [key: string]: string };

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
    DatasetColumns.Vintage
]);

export const ColumnToBadgeMap = {
    [DatasetColumns.New]: { text: "Uutuus", color: "red", icon: "pencil_sparkles" },
    [DatasetColumns.SpecialGroup]: {
        Luomu: { text: "Luomu", color: "green", icon: "plant_pot" },
        "Vegaaneille soveltuva tuote": { text: "Vegaani", color: "emerald", icon: "leaf" },
        "Alkuviini": { text: "Alkuviini", color: "blue", icon: "wine" },
        "Biodynaaminen": { text: "Biodynaaminen", color: "emerald", icon: "yin_yang" },
    },
    [DatasetColumns.Availability]: {
        "Kausituote": { text: "Kausituote", color: "dark_red", icon: "tree" },
        "Erikoiserä": { text: "Erikoiserä", color: "yellow", icon: "star" },
        "Tilausvalikoima": { text: "Tilausvalikoima", color: "cyan", icon: "truck" },
    }
} 
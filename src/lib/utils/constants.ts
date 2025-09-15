
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
    AllColumns.Type,
    AllColumns.Country,
    AllColumns.Manufacturer,
    AllColumns.BottleSize,
    AllColumns.Price,
    AllColumns.PromillePerEuro,
    AllColumns.AlcoholPercentage,
    AllColumns.Availability,
    AllColumns.Servings,
    AllColumns.PackagingType,
    AllColumns.SealingType
] as const;

/**
 * Columns which value can be highlighted in the list view.
 * These are the options for the "Highlight" feature
 */
export const shownColumnsToHighlight = [
    AllColumns.Price,
    AllColumns.BottleSize,
    AllColumns.AlcoholPercentage,
    AllColumns.AlcoholGrams,
    AllColumns.AlcoholGramsPerEuro,
    AllColumns.EstimatedPromille,
    AllColumns.Servings
] as const;

export const defaultSortingColumn = AllColumns.AlcoholGramsPerEuro;

/** Mapping of filters to their unit markers.
 * Used in the UI to show the unit next to the filter value
 */
export const filterToUnitMarker: { [key: string]: string } = {
    [AllColumns.Price]: '€',
    [AllColumns.BottleSize]: 'L',
    [AllColumns.AlcoholGramsPerEuro]: '‰'
} as const;

/**
 * Mapping of filter keys to their display names.
 * Used in the UI to show a more user-friendly name for the filter
 */
export const filterRenameMap: { [key: string]: string } = {
    [AllColumns.BottleSize]: 'Pakkauskoko'
} as const;
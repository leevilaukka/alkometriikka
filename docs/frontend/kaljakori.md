# Kaljakori

`Kaljakori` (`src/lib/alko/index.ts`) is the in-memory product database. The layout builds one
from `data.json` on load, and every page queries it. The sync scripts use the same class to build
the dataset's filter index and the Daily game's product pool, so the browser and the pipeline
parse products identically.

```ts
const { table, metadata, index } = parseDataset(text);       // src/lib/utils/catalog/dataset.ts
const kaljakori = new Kaljakori(table, personalInfo, availability?, index);
```

## From file to table

`parseDataset` validates the file (non-empty `schema` starting with `Numero`, at least one
product) and rebuilds the table shape the app was originally written for:

```
[ [...schema, 'Hintahistoria', 'Poistunut valikoimasta'],   // header
  [...product.values, priceHistory, removed],               // one row per product
  … ]
```

Unknown schema columns only log a warning, so an older bundle keeps working when the sync appends
a column. If `metadata.LastUpdated` is missing, the newest price-history date is used.

## From table to products

The constructor turns each row into a `PriceListItem` object keyed by column name (see
`src/lib/types.ts`).

**Skipped rows**: `Valikoima` is `tarvikevalikoima` (accessories), or `Alkoholi-%` or `Hinta` is
missing. Drunk values can't be computed without them. Removed products are kept.

**Column parsing**: each column's parser is chosen once, not per cell:

| Kind            | Columns                                                                                                         | Result                                                                                                                                                                 |
| --------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| String          | `Numero`, `Nimi`, `Valmistaja`, `EAN` (`columnsHandledAsString`)                                                | String, first letter capitalized                                                                                                                                       |
| Set             | `Luonnehdinta`, `Erityisryhmä`, `Huomautus`, `Rypäleet`, `Ruokasuositukset`, `Myymälät` (`columnsHandledAsSet`) | `Set<string>`, split on `, ` or `. `                                                                                                                                   |
| Zero-if-missing | `Sokeri g/l`, `Hapot g/l`, `Kantavierrep-%`, `Katkerot EBU`, `Energia kcal/100 ml` (`undefinedToZeroColumns`)   | Number, `0` when missing. The column is recorded in the item's `[MissingValues]` symbol set so a real zero can be told from a missing one (e.g. the "Sokeriton" badge) |
| History         | `Hintahistoria`                                                                                                 | Array of price points                                                                                                                                                  |
| Removed         | `Poistunut valikoimasta`                                                                                        | Boolean                                                                                                                                                                |
| Other           | everything else                                                                                                 | Number if it looks numeric, else capitalized string, else `''`                                                                                                         |

**Package size** (`Pullokoko`) is taken from the data; if it's missing it is inferred from
`Hinta / Litrahinta` (if between 0.05 and 30 l), else defaults to 1 l. Products whose size was
inferred are tracked separately because they can't prove two products are different sizes of
the same drink.

**Fill-ins**: an empty `Tyyppi` becomes "Ei määritelty"; an empty `Alatyyppi` becomes the
`Oluttyyppi` or the `Tyyppi`. An empty `Litrahinta` (products not on sale yet) is calculated with
`calculatePricePerLitre` as `(Hinta − Pantti) / Pullokoko`, but only from a declared size, and
recorded in `[MissingValues]` so the product page can mark it as calculated.

The constructor sorts products by alcohol grams per euro, the default sort.

## Columns

On top of the dataset columns, every product gets:

| Group               | Columns                                                                                                      | Source                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `DrunkColumns`      | `Alkoholigrammat`, `Alkoholigrammat / €`, `Arvioidut promillet`, `Promillet / €`, `Annokset`, `€ / l (alk.)` | `calculateDrunkValue` with the user's weight and gender, see [Calculations](calculations.md#drunk-values) |
| `CalculatedColumns` | `Alennuksessa`                                                                                               | `'alennuksessa'` when `getSaleInfo` says the product is on sale today                                     |
| `StoreColumns`      | `Myymälät`                                                                                                   | Names of the stores stocking it, filled by `setAvailability`                                              |

`AllColumns` combines all four groups. Display names, units, sort labels, which columns are shown
as filters or sort keys, and badge rules all live in `src/lib/utils/constants/` (`columns.ts`, `display.ts`, `badges.ts`):

| Constant                                                                   | Controls                                                                                                                      |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `shownFilters`                                                             | Filters in the sidebar, in order                                                                                              |
| `filterAnnotationsToFilter`                                                | Whether a multi-select is OR (any selected) or AND (all selected)                                                             |
| `subCategoryMap`                                                           | Parent → child filters: `Tyyppi → Alatyyppi → Oluttyyppi`, `Valmistusmaa → Alue`                                              |
| `shownSortingKeys`, `defaultSortingOrderMap`, `sortingOrderDescriptionMap` | Sort dropdown options, default direction, and the "Halvin/Kallein"-style labels                                               |
| `shownColumnsToHighlight`                                                  | Columns that can be highlighted with a bar in list rows                                                                       |
| `filterRenameMap`, `filterToUnitMarker`                                    | UI names and units for columns                                                                                                |
| `ColumnToBadgeMap`, `DynamicColumnToBadgeMap`                              | Badges such as Luomu, Vegaani, Kausituote, Alennus −N %, Sokeriton, 6-pack, Uutuus, Tulossa, Poistuva, Poistettu valikoimasta |
| `hideFromProductPageStats`                                                 | Columns left out of the product details table and comparison rows                                                             |

## Filter values

`possibleValues`, `possibleValuesActive`, `columnTypes`, `minAndMaxValues` and
`minAndMaxValuesActive` are computed **lazily** on first access, in one pass over the products:

- Two sets per column: all products, and active (not removed) products only. The filter UI shows
  the active set unless "show removed" is on, so options that only exist on removed products
  (e.g. old category names) don't appear as dead choices.
- Columns covered by the dataset's precomputed [`index`](../data/dataset-format.md#index) are
  taken from it instead of scanned.
- A column's type is the `typeof` its first value; set columns report `'object'`.
- Numeric ranges become the default `[min, max]` of range filters.

When store availability arrives later, only the `Myymälät` values are rebuilt.

## Querying

| Method                                     | What it does                                                                                                  |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `fuzzySearchAndFilter(query, filters)`     | Name search plus filters. Used by every list                                                                  |
| `fuzzySearch(column, query)`               | Values containing the query, or (for queries of 4+ characters) with any word within ~40 % edit distance of it |
| `filter(filters)`                          | Filters without search                                                                                        |
| `findById(id)`, `findByColumn(col, value)` | Lookups                                                                                                       |
| `getFilterValues(col, showRemoved)`        | Options for a filter                                                                                          |
| `getSubFilterValues(parent, filterValues)` | Child values reachable under the current parent selection                                                     |
| `getMinAndMaxValues(col, showRemoved)`     | Default range for a numeric filter                                                                            |
| `findDifferentSizesOfProduct(product)`     | Other package sizes of the same drink, see [Calculations](calculations.md#other-sizes)                        |
| `getCategoryTree()`                        | Tyyppi → Alatyyppi tree for category pages (cached)                                                           |
| `subset(items, personalInfo?)`             | A new Kaljakori over some products                                                                            |

Filter semantics in `fuzzySearchAndFilter`:

- **Number** filters are `[min, max]` inclusive ranges.
- **Set** columns: the selected values must all be present on the product (AND), except
  `Myymälät`, where any one selected store is enough (OR).
- **String** columns: the product's value must be one of the selected values (OR).
- Empty selections are ignored.

## Subsets

`subset(items)` makes a `Kaljakori` over some products (a category, a list, a store) whose filter
options and ranges cover only those products, without reparsing anything. If `personalInfo`
differs from what the parent was built with, drunk values are recomputed on copies. Subsets share
the root's store availability, so a subset made before `availability.json` loaded picks it up.

Category pages, list pages and the stats page all use subsets of the layout's `Kaljakori`.

## Reactivity

`Kaljakori` is a plain class, not `$state`. The one thing that changes after construction, store
availability, is made reactive with `createSubscriber`: `filter`, `fuzzySearchAndFilter`,
`getFilterValues` and `availabilityLoaded` register a dependency, so `$derived` values and effects
that use them re-run when `setAvailability` is called.

## Filters in the URL

`src/lib/utils/catalog/filters.ts` converts between filter state and query parameters:

- `initFilterValues(kaljakori, searchParams)` builds the initial state: ranges default to the
  column's min/max, selections to empty, overridden by matching URL parameters.
- `searchParametersFromFilterValues` writes selections as repeated parameters
  (`?Tyyppi=Viinit&Tyyppi=Oluet`) and ranges as `min-max`. Ranges still at their default are
  left out.
- With `COMMA_SEPARATED_FILTERS` on, `joinFilterParams` writes them comma-separated instead
  (`?Tyyppi=Viinit,Oluet`); a filter with a selection containing a comma keeps the repeated form.
  It's off by default.
- `filterValuesFromSearchParameters` reads both forms whatever the toggle says. A value that is
  one of the filter's own values is kept whole (`Brandyt, armanjakit ja calvadosit`); anything
  else is split on commas.
- `getNarrowedFilterValues` limits a child filter's options to those under the selected parent
  (e.g. only wine subtypes when Tyyppi = Viinit).

Because the parameter names are the Finnish column names, a filtered list URL reads like
`/?Tyyppi=Oluet&Alkoholi-%25=4-6`.

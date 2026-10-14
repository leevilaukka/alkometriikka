# Dataset format

The sync writes three files. All three are published at the site root on `gh-pages` and are
also linked from the app's settings dialog for anyone who wants the raw data.

| File                | Size (Oct 2026)          | Loaded by the app        | Purpose                                        |
| ------------------- | ------------------------ | ------------------------ | ---------------------------------------------- |
| `data.json`         | ~7.8 MB, ~1.3 MB gzipped | Yes, blocks first render | Every product, its values and price history    |
| `availability.json` | ~4.2 MB, ~0.9 MB gzipped | Yes, after first render  | Stores and which stores stock each product     |
| `hashes.json`       | ~0.55 MB gzipped         | No                       | Change-detection hashes, used only by the sync |

Type definitions: `scripts/data/types.ts` (the strict writer side) and
`src/lib/utils/dataset.ts` (`StoredDataset`, the lenient reader side).

## `data.json`

```jsonc
{
	"schema": ["Numero", "Nimi", /* … 34 columns, see below */ "Ruokasuositukset"],
	"metadata": {
		"LastUpdated": "2026-10-12T18:00:41.123Z", // last run that changed something
		"LastSynced": "2026-10-13T06:00:39.456Z", // last run, changed or not
		"HashVersion": 1,
		"ci": {
			"sync": { "commit": "<sha>", "workflowRun": "https://github.com/…/actions/runs/…" },
			"update": { "commit": "<sha>", "workflowRun": "https://github.com/…/actions/runs/…" }
		}
	},
	"products": {
		"906458": {
			"values": ["906458", "Fair & Square …" /* one value per schema column */],
			"priceHistory": [
				{ "date": "2026-01-26", "price": 12.48 },
				{
					"date": "2026-09-02",
					"price": 10.98,
					"normalPrice": 12.48,
					"campaignStart": "2026-09-02",
					"campaignEnd": "2026-09-29"
				}
			],
			"meta": { "removedFromSelection": "2026-07-14", "detailCheckedAt": "2026-10-01" }
		}
	},
	"index": {/* precomputed filter values, see below */}
}
```

### `metadata`

- **`LastSynced`** moves on every successful sync. The app's stale-data banner fires when it is
  more than 24 hours old (see [Features → Notices](../frontend/features.md#site-notices)).
- **`LastUpdated`** moves only when a product was added, updated, flagged as removed, or dropped
  as irrelevant. Feeds use it as their build date.
- **`HashVersion`** records which hashing algorithm produced the hashes, so `rehash.ts` knows when
  to recompute them.
- **`ci.sync` / `ci.update`** link the commit and workflow run of the last sync and the last sync
  that changed data. The settings dialog's info tab links to them.

### `products`

Keyed by product number. Products are **never deleted**. When a product disappears from Alko's
search results it stays in the file with `meta.removedFromSelection` set to the date it was first
missed, and its `Uutuus` value is cleared. If it comes back, the flag is removed. The only
products ever dropped are gifts and drinking accessories (main group `mainGroup_002`,
"lahja- ja juomatarvikkeet"), which are filtered out entirely.

- **`values`** is aligned with `schema`. Values are mostly what the preprocessors in
  `FIELD_TO_LEGACY_SCHEMA` produce: strings, numbers, `null`, and for `Luonnehdinta` an array of
  strings.
- **`priceHistory`** gets a new point only when the price differs from the last point. The first
  point is the first time the sync saw the product. Points recorded during an active campaign also
  carry `normalPrice`, `campaignStart` and `campaignEnd`, so the price chart can draw past sale
  periods.
- **`meta.detailCheckedAt`** is the last date the sync fetched this product's details. It drives
  the periodic re-verification (see [Sync pipeline](sync-pipeline.md#pass-3-re-verify-stale-details)).

### `index`

Filter values precomputed by `scripts/data/dataset-index.ts` so the browser doesn't have to
collect and sort them from 13 000+ products on load. It is built with the app's own `Kaljakori`,
so it is exactly what the browser would compute.

```jsonc
{
	"version": 1,
	"columns": ["Numero", /* … the parsed header, incl. Hintahistoria, Poistunut valikoimasta */],
	"count": 13700,          // products Kaljakori keeps
	"removedCount": 2400,    // how many of them are removed from the selection
	"possibleValues":       { "Tyyppi": ["Juomasekoitukset", "Oluet", …], … },
	"possibleValuesActive": { "Tyyppi": ["Panimotuotteet", …], … }
}
```

Only low-cardinality columns are included (at most 10 % as many unique values as products), so
names, ids and prices are still computed in the browser. `Kaljakori` ignores the index unless its
version, column list, product count and removed count all match the data it just parsed, so a
stale or missing index only costs speed.

## Column schema

The schema is `LEGACY_HEADERS` in `scripts/data/constants.ts`. The names come from the XLSX price
list Alko used to publish; the dataset was migrated to Alko's API in 2026 but kept the column
names (see [`notes/migration.md`](../../notes/migration.md)). New columns are always **appended**
so that an older deployed app bundle can still read a newer dataset positionally.

| #   | Column                   | Source field (API)                     | Hashed | Notes                                                                                                                  |
| --- | ------------------------ | -------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------- |
| 0   | `Numero`                 | `id`                                   |        | Product number. Must be the first column                                                                               |
| 1   | `Nimi`                   | `name`                                 | ✓      |                                                                                                                        |
| 2   | `Valmistaja`             | `producer` (detail)                    |        |                                                                                                                        |
| 3   | `Pullokoko`              | `volume`                               |        | Litres                                                                                                                 |
| 4   | `Hinta`                  | `price`                                | ✓      | Euros                                                                                                                  |
| 5   | `Litrahinta`             | `pricePerLitre` (detail)               |        |                                                                                                                        |
| 6   | `Uutuus`                 | `statusId`                             | ✓      | `"Uutuus"` when `statusId === 'U'`, else `null`                                                                        |
| 7   | `Hinnastojärjestyskoodi` | —                                      |        | Always `null` (no API equivalent)                                                                                      |
| 8   | `Tyyppi`                 | `mainGroup` (detail)                   |        | Category                                                                                                               |
| 9   | `Alatyyppi`              | `category` (detail)                    |        | Subcategory                                                                                                            |
| 10  | `Erityisryhmä`           | `certificateClass`                     |        | Certificate labels joined with `, ` (Luomu, Vegaaneille soveltuva tuote…). Refreshed every sync                        |
| 11  | `Oluttyyppi`             | `flavorTag.text` (detail)              |        | Taste style                                                                                                            |
| 12  | `Valmistusmaa`           | `countryName`                          |        |                                                                                                                        |
| 13  | `Alue`                   | `productionSites` (detail)             |        | `"<label> - <value>"` of the site with a region id                                                                     |
| 14  | `Vuosikerta`             | `vintage` (detail)                     |        |                                                                                                                        |
| 15  | `Etikettimerkintöjä`     | —                                      |        | Always `null`                                                                                                          |
| 16  | `Huomautus`              | `moreInfo` (detail)                    |        | Free-text notes, e.g. "Vegaaneille soveltuva tuote", "Saattaa sisältää sakkaa". Not in the declared API types          |
| 17  | `Rypäleet`               | `grapeVarieties[].label` (detail)      |        | Joined with `, `                                                                                                       |
| 18  | `Luonnehdinta`           | `taste`                                | ✓      | Split on `,` into an array                                                                                             |
| 19  | `Pakkaustyyppi`          | `packageTypes`                         |        | Label part of `id\|key\|label`                                                                                         |
| 20  | `Suljentatyyppi`         | `closures`                             |        | Label part                                                                                                             |
| 21  | `Alkoholi-%`             | `abv`                                  | ✓      |                                                                                                                        |
| 22  | `Hapot g/l`              | `acidPerLitre` (detail)                |        |                                                                                                                        |
| 23  | `Sokeri g/l`             | `sugarPerLitre` (detail)               |        |                                                                                                                        |
| 24  | `Kantavierrep-%`         | `beerWortPlato` (detail)               |        |                                                                                                                        |
| 25  | `Väri EBC`               | —                                      |        | Always `null`                                                                                                          |
| 26  | `Katkerot EBU`           | `beerBitternessEbu` (detail)           |        |                                                                                                                        |
| 27  | `Energia kcal/100 ml`    | `nutrition.kiloCaloriesPerDL` (detail) |        |                                                                                                                        |
| 28  | `Valikoima`              | `selectionTypes`                       | ✓      | Label part                                                                                                             |
| 29  | `EAN`                    | —                                      |        | `null` for API-synced products (the API has no EANs). Some removed products still carry EANs from the legacy XLSX data |
| 30  | `Normaalihinta`          | `lowest_30d_price`                     | ✓      | Only during campaigns. Euro number                                                                                     |
| 31  | `Kampanja alkaa`         | `campaign_start_date`                  | ✓      | `YYYY-MM-DD`                                                                                                           |
| 32  | `Kampanja päättyy`       | `campaign_end_date`                    | ✓      | `YYYY-MM-DD`                                                                                                           |
| 33  | `Ruokasuositukset`       | `foodSymbolId`                         |        | Finnish labels from `src/lib/utils/food.ts`, joined with `, `. Refreshed every sync                                    |

"(detail)" marks fields only the per-product detail API returns. Everything else comes from the
search API. "Hashed" columns feed the change-detection hash; see
[Sync pipeline](sync-pipeline.md#change-detection).

### Columns added by the app

`parseDataset` (`src/lib/utils/dataset.ts`) appends two columns when it turns the file into a
table: **`Hintahistoria`** (the `priceHistory` array) and **`Poistunut valikoimasta`** (`true`
when `meta.removedFromSelection` is set). `Kaljakori` then adds the derived columns described in
[Kaljakori](../frontend/kaljakori.md#columns).

### Changing the schema

1. Append the column to `LEGACY_HEADERS` and add a `FIELD_TO_LEGACY_SCHEMA` entry at the same
   position in `scripts/data/constants.ts`.
2. Add it to `DatasetColumns` in `src/lib/utils/constants.ts` (and to `PriceListItem` in
   `src/lib/types.ts`). `tests/data/dataset.test.ts` checks that the writer and reader agree.
3. If it is a list, add it to `columnsHandledAsSet`; if missing values should count as zero, to
   `undefinedToZeroColumns`.
4. Decide whether it is hashed. Hashed fields must come from the **search** API. If you change
   which columns are hashed or how a hashed value is preprocessed, bump `HASH_VERSION`.
5. Existing rows are padded with `null` on read (`alignValues`), and only products the sync
   re-fetches get real values. If the column is a search-API field, consider adding it to
   `SEARCH_REFRESHED_COLUMNS` so every product picks it up on the next run.

## `hashes.json`

```json
{ "HashVersion": 1, "hashes": { "906458": "3f1c…", "…": "…" } }
```

Split out of `data.json` because the 64-character hashes were about a third of the gzipped file
and the app never uses them (`scripts/data/dataset-file.ts`). `readDataset` merges them back
in. Each product's hash comes from, in order: the product itself (datasets written before the
split), `hashes.json` if its `HashVersion` matches, or a recomputation from the stored values.
Losing `hashes.json` therefore never causes a full refetch or drops price history; it only
re-fetches products whose stored values hash differently from the search payload.

## `availability.json`

```jsonc
{
	"lastUpdated": "2026-10-13T06:00:39.456Z",
	"stores": {
		"2102": {
			"id": "2102", "name": "Helsinki keskusta Arkadia",
			"address": "Salomonkatu 1", "postalCode": "00100", "postOffice": "HELSINKI",
			"latitude": 60.17, "longitude": 24.93,
			"openDays": ["kiinni", "10–21", …],
			"openHours": [{ "date": "2026-10-13", "hours": "10–21" }, …]
			// …plus the rest of Alko's store object, unmodified
		}
	},
	"product": { "906458": ["2102", "5016", …] }
}
```

- **`stores`** is Alko's `/api/stores` response keyed by id, minus pickup points
  (`outletType === "2"`).
- **`product`** maps every product in the latest search sweep to the stores that have it in stock
  (the search API's `storeId` field). It covers only products currently in the selection.
- It is rewritten in full on every sync, so `lastUpdated` is the sync time.

`parseAvailability` (`src/lib/utils/availability.ts`) validates it in the browser and drops
malformed entries.

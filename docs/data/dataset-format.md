# Dataset format

The sync writes four files. All four are published at the site root on `gh-pages`, and all but
`hashes.json` are linked from the app's settings dialog for anyone who wants the raw data.

| File                | Size (Oct 2026)          | Loaded by the app        | Purpose                                                   |
| ------------------- | ------------------------ | ------------------------ | --------------------------------------------------------- |
| `data.json`         | ~5.8 MB, ~0.85 MB brotli | Yes, blocks first render | Products in the selection, their values and price history |
| `data-removed.json` | ~1.4 MB, ~0.23 MB brotli | Yes, after first render  | Products removed from the selection, in the same format   |
| `availability.json` | ~1.3 MB, ~0.2 MB gzipped | Yes, after first render  | Stores and which stores stock each product                |
| `hashes.json`       | ~0.55 MB gzipped         | No                       | Change-detection hashes, used only by the sync            |

`packDataset` and `unpackDataset` (`src/lib/utils/catalog/datasetFile.ts`) split and join the two
dataset files and their word lists. Scripts read both through `readStoredDataset`
(`scripts/lib/stored-dataset.ts`), which throws if `data.json` lists removed products that
`data-removed.json` doesn't hold, so a missing file stops a script instead of quietly leaving
products out. Datasets written before the split (one file, no word lists) read the same.

Type definitions: `scripts/data/types.ts` (the strict writer side) and
`src/lib/utils/catalog/dataset.ts` (`StoredDataset`, the lenient reader side).

## `data.json`

```jsonc
{
	"schema": ["Numero", "Nimi", /* … 36 columns, see below */ "Pantti"],
	"metadata": {
		"LastUpdated": "2026-10-12T18:00:41.123Z", // last run that changed something
		"LastSynced": "2026-10-13T06:00:39.456Z", // last run, changed or not
		"HashVersion": 2,
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
			"meta": { "removedFromSelection": "2026-07-14" }
		}
	},
	"index": {/* precomputed filter values, see below */},
	"dictionaries": { "Luonnehdinta": ["keltainen", "makea", …], "Ruokasuositukset": ["Kala", …] },
	"removedProducts": 2501 // how many products data-removed.json holds
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
missed, and its `Uutuus` and `Tila` values are cleared. If it comes back, the flag is removed. The only
products ever dropped are gifts and drinking accessories (main group `mainGroup_002`,
"lahja- ja juomatarvikkeet"), which are filtered out entirely.

- Products with status `Tulee` have no `Litrahinta`: the detail API leaves `pricePerLitre` out until
  they're on sale. The app then calculates it as `(Hinta − Pantti) / Pullokoko`, which is also how
  Alko's own litre prices work out.
- **`values`** is aligned with `schema`. Values are mostly what the preprocessors in
  `FIELD_TO_LEGACY_SCHEMA` produce: strings, numbers, `null`, and for `Luonnehdinta` and
  `Ruokasuositukset` arrays of trimmed words (tasting notes lowercased; the app capitalizes them).
  These two are stored as indexes into the file's `dictionaries` (an array of numbers), which is
  about 6 % of the compressed file smaller than repeating the words in every product. Older
  datasets have them in other shapes (a joined string, words with a leading space, sentence case);
  `upgradeStoredValues` converts those on read, and the app reads both.
- **`priceHistory`** gets a new point only when the price differs from the last point. The first
  point is the first time the sync saw the product. Points recorded during an active campaign also
  carry `normalPrice`, `campaignStart` and `campaignEnd`, so the price chart can draw past sale
  periods.
- **`meta.detailCheckedAt`** is the last date the sync fetched this product's details. It drives
  the periodic re-verification (see [Sync pipeline](sync-pipeline.md#pass-3-re-verify-stale-details)).
  Only the sync uses it, so it is stored in [`hashes.json`](#hashesjson) and merged back in on read.

### `index`

Filter values precomputed by `scripts/data/dataset-index.ts` so the browser doesn't have to
collect and sort them from 13 000+ products on load. It is built with the app's own `Kaljakori`,
over every product including the removed ones, so it is exactly what the browser would compute
once `data-removed.json` has loaded.

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
version and column list match and its counts fit the products: the active count always, and the
removed count once the removed products are added. Until then the active values stand in for all
of them. A stale or missing index only costs speed.

## `data-removed.json`

```jsonc
{ "schema": [/* same as data.json */], "dictionaries": { … }, "products": { "906458": { … } } }
```

The products with `meta.removedFromSelection` set, in the same shape as in `data.json`, with their
own word lists so the file stands alone. Most visits never show a removed product, so the app
fetches this file once `data.json` is in and adds its products after the first render. Its `schema`
must match `data.json`'s, or readers ignore it rather than read values into the wrong columns.

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
| 18  | `Luonnehdinta`           | `taste`                                | ✓      | Split on `,` into trimmed, lowercased words                                                                            |
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
| 33  | `Ruokasuositukset`       | `foodSymbolId`                         |        | List of Finnish labels from `src/lib/utils/catalog/food.ts`. Refreshed every sync                                      |
| 34  | `Tila`                   | `statusId`                             | ✓      | `Aktiivinen` (A), `Uutuus` (U), `Poistuva` (P, being phased out) or `Tulee` (X, not on sale yet)                       |
| 35  | `Pantti`                 | `deposit` (detail)                     |        | Deposit in euros. Included in `Hinta`, not in `Litrahinta`. Missing for most products, including some cans             |

"(detail)" marks fields only the per-product detail API returns. Everything else comes from the
search API. "Hashed" columns feed the change-detection hash; see
[Sync pipeline](sync-pipeline.md#change-detection).

### Columns added by the app

`parseDataset` (`src/lib/utils/catalog/dataset.ts`) appends two columns when it turns the file into a
table: **`Hintahistoria`** (the `priceHistory` array) and **`Poistunut valikoimasta`** (`true`
when `meta.removedFromSelection` is set). `Kaljakori` then adds the derived columns described in
[Kaljakori](../frontend/kaljakori.md#columns).

### Changing the schema

1. Append the column to `LEGACY_HEADERS` and add a `FIELD_TO_LEGACY_SCHEMA` entry at the same
   position in `scripts/data/constants.ts`.
2. Add it to `DatasetColumns` in `src/lib/utils/constants/columns.ts` (and to `PriceListItem` in
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
{
	"HashVersion": 2,
	"hashes": { "906458": "3f1c…", "…": "…" },
	"detailCheckedAt": { "906458": "2026-10-01", "…": "…" }
}
```

Split out of `data.json` because the 64-character hashes were about a third of the gzipped file
and the app never uses them (`scripts/data/dataset-file.ts`). `readDataset` merges them back
in. Each product's hash comes from, in order: the product itself (datasets written before the
split), `hashes.json` if its `HashVersion` matches, or a recomputation from the stored values.
Losing `hashes.json` therefore never causes a full refetch or drops price history; it only
re-fetches products whose stored values hash differently from the search payload.

`detailCheckedAt` holds each product's `meta.detailCheckedAt`, also sync-only (about 2% of the
compressed `data.json`). It is restored whatever the `HashVersion`. Without it every product is due
for re-verification, which the sync works through a capped number per run.

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
			"openHours": [{ "date": "2026-10-13", "hours": "10–21" }, …],
			"openHoursNormal": [{ "date": "2026-10-12", "hours": "10–21" }, …],
			"openHoursException": [{ "date": "2026-10-31", "hours": "Kiinni" }]
			// …plus the rest of Alko's store object, unmodified
		}
	},
	"format": 2,
	"storeIds": ["2102", "2103", …, "5016"],
	"product": { "906458": "AQAAgA…" }
}
```

- **`stores`** is Alko's `/api/stores` response keyed by id, minus pickup points
  (`outletType === "2"`).
- A store's opening hours come in three calendars. **`openHours`** is the actual schedule with
  exceptions (holidays, closures) applied, from the fetch day through Sunday of next week;
  `openDays` is its hours alone. Open/closed status and today's hours come from it.
  **`openHoursNormal`** is the regular schedule without exceptions, Monday of this week through
  Sunday of next week. The store page uses it to flag days whose hours differ from normal, and the
  prerendered store stubs use its first week for their JSON-LD `openingHoursSpecification`.
  **`openHoursException`** lists only the days that differ; the stubs publish them as
  `specialOpeningHoursSpecification` (a closed day as `opens` and `closes` both `"00:00"`).
- **`product`** maps every product in the latest search sweep to the stores that have it in stock
  (the search API's `storeId` field). It covers only products currently in the selection.
  Each value is a base64 bitmap over **`storeIds`**, every store id any product refers to
  (pickup points included) in numeric order: bit `i % 8` of byte `⌊i / 8⌋` set means the store
  `storeIds[i]` has it, and trailing zero bytes are cut, so a product in no store is `""`. That is
  about a quarter of the download of a list of id strings per product, the format before
  `format: 2`, and much less JSON to parse.
- It is rewritten in full on every sync, so `lastUpdated` is the sync time.

`encodeStockedStores` and `readStockedStores` (`src/lib/utils/catalog/availabilityFile.ts`) write
and unpack the product map; the reader also takes the earlier format, which an old copy in the
service worker's cache or the previous deploy read by the stock history may still be in.
`parseAvailability` (`src/lib/utils/catalog/availability.ts`) validates it in the browser and drops
malformed entries.

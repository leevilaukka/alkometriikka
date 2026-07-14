# Dataset format migration

Documents the move from the legacy XLSX-derived dataset to the new API-synced
dataset, and the changes required in the frontend loader
([`src/routes/+layout.ts`](../src/routes/+layout.ts)) to consume it.

## Why

The dataset was previously generated from Alko's XLSX price list and shipped as a
single `table` + `metadata` object. It is now produced by the sync script in
[`scripts/setup/`](../scripts/setup) directly from Alko's API, using change
detection (hashing) so only new/changed products are re-fetched. See
[`notes/notes.md`](./notes.md) and [`notes/improvements.md`](./improvements.md)
for the sync design.

## Format change

### Old format (`{ table, metadata }`)

```jsonc
{
  "table": [
    ["Numero", "Nimi", /* ... */, "EAN", "Hintahistoria"], // header row
    ["906458", "Fair & Square...", /* ... */, "7350084980013", [{ "date": "2026-01-26", "price": "12.48" }]],
    // ...one array per product, price history inline as the last column
  ],
  "metadata": { "CreatedDate": "2026-03-05T00:00:00.000Z", /* Apache POI props */ }
}
```

- One flat `table` array; row `0` is the header, the rest are product rows.
- `Hintahistoria` (price history) is the **last column**, inline in each row.
- Empty cells were `null`.
- Document `metadata` (author, dates, etc.) came from the XLSX file.

### New format (`MigratedData`)

```jsonc
{
  "schema": ["Numero", "Nimi", /* ... */, "EAN"], // 30 legacy headers, NO "Hintahistoria"
  "906458": {
    "hash": "…",                                   // change-detection hash
    "values": ["906458", "Fair & Square...", /* ... */, "7350084980013"], // schema-ordered
    "priceHistory": [{ "date": "2026-01-26", "price": 12.48 }],           // separate field
    "meta": { "removedFromSelection": "2026-07-14" }                      // optional lifecycle flag
  }
  // ...one entry per product id
}
```

Key differences:

| Aspect | Old | New |
| --- | --- | --- |
| Top-level shape | `{ table, metadata }` | `{ schema, [productId]: MigratedProduct }` |
| Products | array of rows | object keyed by product id |
| Header | `table[0]` (incl. `Hintahistoria`) | `schema` (30 cols, **no** `Hintahistoria`) |
| Price history | inline last column | separate `priceHistory` field |
| Price values | strings | numbers |
| Removed products | absent | kept, flagged via `meta.removedFromSelection` |
| Metadata | XLSX document props | none |

Type definitions live in [`scripts/setup/types.ts`](../scripts/setup/types.ts)
(`MigratedData`, `MigratedProduct`, `PricePoint`, `ProductMeta`).

## Frontend change (`formatDatasetToJSON`)

The rest of the app (`Kaljakori`, `Product.svelte`, `Settings.svelte`) still
expects the old `{ table, metadata }` shape, where the table has a header row,
one row per product, and `Hintahistoria` as the final column. Rather than
rewrite every consumer, `formatDatasetToJSON` now adapts the new on-disk format
back into that shape:

1. **Destructure** `schema` from the remaining keyed product entries.
2. **Validate** `schema` (first column must be `Numero`; every column must be a
   known `DatasetColumns` value) — same guarantees as before.
3. **Rebuild the header** as `[...schema, "Hintahistoria"]` so the price-history
   column the app relies on exists again.
4. **Rebuild rows** as `[...product.values, priceHistory]`, keeping **every**
   product — including ones no longer in Alko's selection
   (`meta.removedFromSelection`). The dataset never deletes products, and all of
   them should stay visible in the UI, so no products are dropped here.
5. **Derive `metadata.CreatedDate`** from the newest `priceHistory` date, since
   the new format has no document metadata. This preserves the "Hinnaston
   päiväys" line in [`Settings.svelte`](../src/lib/components/widgets/Settings.svelte).

Error messages and the returned `{ table, metadata }` contract are unchanged, so
downstream code needs no modifications.

## Missing products investigation

**Symptom:** the API returns ~11K active items, the dataset holds 13177 products
total (active + discontinued, since products are never deleted), but the UI only
displayed ~7K.

Products were being dropped at two independent points between `data.json` and the
rendered list:

1. **Loader filter (root cause).** An earlier version of `formatDatasetToJSON`
   filtered out every product flagged with `meta.removedFromSelection`. Because
   the new format keeps discontinued products instead of deleting them — and a
   large share of the dataset is flagged (e.g. `100001`, `100004` are flagged in
   just the first few entries) — this silently removed thousands of otherwise
   valid rows. These products still have valid alcohol-% and price, so they
   should be shown. **Fix:** the filter was removed; every product is now kept.

2. **`Kaljakori` data-quality skip (secondary, pre-existing).** The constructor
   in [`src/lib/alko/index.ts`](../src/lib/alko/index.ts) skips rows that have no
   alcohol-%, no price, or no product number, plus `tarvikevalikoima` (accessory)
   rows. This is unrelated to selection status: it exists because "drunk value"
   metrics (alcohol grams, promille/€, etc.) can't be computed without alcohol-%
   and price. Left in place.

**Outcome / how the counts add up:**

- ~11K active + discontinued-but-kept ≈ 13177 total in `data.json`.
- Removing the loader filter restores the discontinued products to the UI.
- Any residual gap below 13177 is point #2: rows with missing alcohol-% or price.
  Showing those would require relaxing the `Kaljakori` skip, at the cost of blank/
  `NaN` drunk-value columns (and broken per-euro/promille sorting) for those rows.

## Notes / follow-ups

- If `Hintahistoria` is eventually added to `schema` on disk, step 3 should stop
  appending it to avoid a duplicate column.
- All products are shown, including discontinued ones (`meta.removedFromSelection`).
   The sync never deletes products; the loader deliberately keeps them so the UI
   reflects the full dataset count.
- `Kaljakori` still skips rows with no alcohol-% or price (drunk metrics can't be
   computed for them). That is a separate, pre-existing data-quality filter — not
   the selection status.

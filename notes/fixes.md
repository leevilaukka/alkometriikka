# Fixes

## Nested `MigratedData` shape with dataset metadata

The on-disk dataset (`data.json`) type was changed from a flat map to a nested
object. Products are no longer stored as top-level keys alongside `schema`;
instead they live under a dedicated `products` field, and a new `metadata`
object carries two timestamps.

### New type

```ts
export type MigratedData = {
  schema: readonly string[];
  metadata: {
    LastUpdated: string; // when the last actual change in the data was detected
    LastSynced: string;  // when the data was last fetched from Alko
  };
  products?: Record<string, MigratedProduct>;
};
```

- **`LastSynced`** — updated on **every** sync run, since each run fetches data.
- **`LastUpdated`** — updated **only when a change is detected** (a product was
  added, updated, removed from selection, or filtered out as irrelevant).
  Otherwise the previous value is carried over.

### Files changed

- **`scripts/setup/index.ts`** (sync/index script)
  - Products are collected in a local `products` map and written under
    `result.products` instead of as top-level keys.
  - Existing products are read via `existing.products`; the old
    `id === "schema"` guards were removed.
  - `metadata` is built on every write: `LastSynced` = now, `LastUpdated` = now
    only when `added`/`updated`/`removed`/`filteredRemoved` > 0, else the
    previous `LastUpdated` is preserved.
  - Fresh-start fallbacks now include `products: {}` and a `metadata` stamp.

- **`scripts/setup/migrate.ts`** (one-time migration)
  - Writes products under `out.products` and stamps `metadata`
    (`LastUpdated`/`LastSynced`) at migration time.

- **`scripts/setup/cleanup.ts`** (one-off cleanup)
  - Iterates and deletes from `data.products` instead of the top-level object.

- **`src/routes/+layout.ts`** (app consumer)
  - Destructures `{ schema, metadata, products }` instead of spreading every
    non-schema key as a product.
  - Prefers `metadata.LastUpdated` for the displayed dataset date
    (`CreatedDate`), falling back to the newest price-history entry for older
    datasets without metadata.

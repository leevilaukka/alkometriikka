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

## Order-independent hashing for `taste` (Luonnehdinta)

Fixed a bug where products whose `taste`/Luonnehdinta descriptors were returned
by Alko's search API in a **different order** (but with the same set of values)
were treated as "changed", triggering an unnecessary detail re-fetch on every
sync.

### Root cause

`taste` is a hashed field (`usedForHashing: true`) whose preprocessor splits the
comma-string from the search API into an array
(`(value) => typeof value === "string" ? value.split(",") : value`). The
change-detection hash is computed with `getHash`, which does
`JSON.stringify(values)`. Because `JSON.stringify` of an array is
**order-sensitive**, the same descriptors in a different order produced a
different hash → the first-pass comparison in `index.ts` saw a mismatch → the
product was needlessly re-fetched. Whitespace drift from the untrimmed
`split(",")` (e.g. `" lämmin"`) could cause the same spurious mismatch.

### Fix

- **`scripts/setup/constants.ts`** — `getHash` now canonicalizes each value
  before stringifying via a new `canonicalizeHashValue` helper: array-valued
  entries are trimmed and sorted, so the same set of entries hashes identically
  regardless of source order.
  - Single-point fix: both the sync path (`index.ts`) and the migration path
    (`migrate.ts`) route through `getHash`, so both benefit automatically.
  - Only `taste` is array-valued among the hashed fields, so the blast radius is
    minimal.
  - The stored `values` (and thus the app's display order) are left untouched —
    only the hash representation is canonicalized.

- **`scripts/setup/rehash.ts`** — temporary one-off script that recomputes the
  `hash` for every product in `data.json` **in place** (only `hash` changes)
  using the new `getHash`. Run once after this change so stored hashes match what
  the next sync produces; otherwise affected products would be re-fetched once.
  - Usage: `bun run scripts/setup/rehash.ts` (or `--dev` for `./static/data.json`).
  - Safe to delete after the rehash has been applied.

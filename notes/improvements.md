# Readability & Quality Improvements for `scripts/new-setup.ts`

## 1. Break up the giant `createProductRow` function
This is the biggest readability win. It's ~120 lines mixing extraction, business logic, and assignment.

- **Extract per-field getters**: `getTypeName()`, `getSubtype()`, `getRegion()`, `getCountryName()`, `getPackageSize()`, `getAlcohol()`, `getClosure()`, `getLabels()`, `getProducer()`, `getEnergyPer100ml()`, `getGroupCode()`, etc. Each takes `(details, search)` and returns its value.
- **Extract the volume-resolution logic** (the multi-fallback IIFE) into a dedicated `resolvePackageSize(details, search)` — it currently has 6 fallback branches inline.
- **Extract price-history handling** into `updatePriceHistory(previousRow, headers, computedPrice)`.

## 2. Replace the long `if/else if` header chain with a lookup map
The 30-branch `if (header === ...) else if ...` block is hard to scan and O(n) per field. Instead build a `Record<string, () => any>` (a field-builder map keyed by header name), then:
```
row[i] = (fieldBuilders[header]?.() ?? row[i]) ?? ""
```
This makes each field a single named entry and removes the repetitive string comparisons.

### Reuse the existing `FIELD_TO_LEGACY_SCHEMA` pattern
`scripts/new-2026/constants.ts` already implements this exact idea declaratively: an array of
`{ newPropertyKey, legacyKey, usedForHashing, preprocessor }` entries that map each source field to a
legacy column via a small `preprocessor` function. This is the table-driven equivalent of the
`if/else if` chain in `createProductRow`.

Rather than inventing a new `Record<string, () => any>`, adopt (or import) this same schema shape:

- Each legacy column becomes one declarative row instead of an `else if` branch — the mapping lives as
  **data**, not control flow.
- The scattered inline extraction logic (e.g. the `packageTypes`/`closures`/`selectionTypes`
  `split("|")[2]` handling, `grapeVarieties` join, `nutrition.kiloCaloriesPerDL`) moves into named
  `preprocessor` functions, directly addressing points #1 and #7.
- `createProductRow` collapses to a single loop over the schema:
  `row[i] = schema[i].preprocessor(source[schema[i].newPropertyKey]) ?? row[i] ?? ""`.
- The `usedForHashing` flag also gives a clean, declarative way to compute change-detection hashes,
  potentially simplifying the `priceChanged` / sparse-row reprocessing logic (point #5).

Caveat: the two schemas run in opposite directions (new-2026 maps API → legacy for hashing/migration,
whereas `createProductRow` builds legacy rows from `details` + `search`). The **structure** is directly
reusable even if the individual `preprocessor` bodies differ; ideally factor the shared shape into one
module so both scripts stay in sync.

## 3. Centralize the "magic" header strings
Headers like `"Pullokoko"`, `"Hinta"`, `"Numero"`, `"Hintahistoria"` are repeated as string literals throughout (`indexOf("Hinta")`, etc.). Define a `HEADERS` const object/enum so typos are caught and renames are single-point.

## 4. Precompute header indices once
`createLookupMap`, `createProductRow`, `isSparseRow`, `hasRequiredFields`, and the removal loop all call `headers.indexOf(...)` repeatedly (some inside loops). Build an index map (`{ Numero: 0, Nimi: 1, ... }`) once and reuse it. Improves both readability and performance.

## 5. Split `scrapeAndMerge` into smaller units
This function is very long and holds ~10 mutable counters. Suggestions:

- Group counters into a single `stats` object (or a small `ScrapeStats` class) instead of 10 separate `let` variables.
- Extract the **worker pool** logic into `processProductsConcurrently(toProcess, ...)`.
- Extract the **reprocess-decision** logic (`shouldReprocess` block) into `classifyProduct(product, existing, headers)` returning a reason enum.
- Extract the **removal of discontinued products** into `removeDiscontinued(data, foundProductIds)`.
- Extract the **summary printing** into `printSummary(stats)`.

## 6. Configuration/env parsing in one place
Env vars (`OUTPUT_MODE`, `ALKO_MAX_PAGES`, `ALKO_DETAIL_CONCURRENCY`, `ALKO_REFRESH_SPARSE`) are read in scattered spots. Consolidate into a single `loadConfig()` returning a typed `Config` object.

## 7. Reduce `as any` casts
There are many `(search as any).xxx` and `(details as any).xxx` accesses. Extend the `SearchProduct` / `ProductDetails` interfaces with the real optional fields (`abv`, `countryName`, `seasonalProductId`, `containerOptions`, `scales`, `productionSites`, etc.). This improves both safety and self-documentation.

## 8. Extract the manual worker-pool into a reusable helper
The `cursor`/`workers`/`Array.from({length: concurrency})` pattern is a hand-rolled concurrency limiter. A small `mapWithConcurrency(items, limit, fn)` helper would make the intent clear and be reusable.

## 9. Magic numbers → named constants
Values like `>= 12` (sparse threshold), `pageSize = 1000`, backoff `2000`, `60000`, delays `500/1000/2000/5000`, `pageCount > 8` should become named constants (`SPARSE_EMPTY_THRESHOLD`, `PAGE_SIZE`, `MAX_BACKOFF_MS`, etc.) with brief rationale.

## 10. Minor cleanups
- Stray lone `;` after the `ProductRow` interface.
- `EAN` field just copies `row[i]` back to itself — worth a comment explaining why (it's never sourced from the API) or handling explicitly.
- Duplicate delay logic: there's a page delay at the top of the loop **and** at the bottom — consolidate to avoid double-sleeping.
- `formatGrapes`/`formatDescription` take the whole `details` but only use one field — could take the array directly for clarity.

---

**Suggested starting point:** #1 + #2 + #4 (the field-builder refactor with cached indices) — targets the core readability concern with the biggest payoff.

---

## Implementation summary (done)

Implemented the improvements by completing the **new-2026** approach rather than patching the old
`new-setup.ts`, since the WIP folder + `notes/notes.md` describe a cleaner, hash-based sync that supersedes it.

### What changed

**`scripts/new-2026/index.ts`** — implemented the "new data sync" flow from `notes/notes.md`, which was
previously just a doc comment:

1. Paginate the search API → build legacy value arrays via the declarative schema → hash only the
   `usedForHashing` fields.
2. Compare each hash against the existing dataset; **skip unchanged products entirely**.
3. Fetch full details **only** for new/changed products (concurrency-limited).
4. Merge, update price history, and write back to `data-migrated.json`.

This directly realizes the improvements above:

- **#1 / #2 / #7** — the 120-line `createProductRow` + 30-branch `if/else` chain is replaced by
  `buildLegacyValues()` looping over `FIELD_TO_LEGACY_SCHEMA`; no `as any` casts in field logic.
- **#3 / #4** — headers centralized in `LEGACY_HEADERS`, indices resolved once (`HINTA_INDEX`, etc.).
- **#5** — small units: `loadSearchProducts`, `fetchProductDetails`, `sync`, `printSummary`; counters
  grouped into one `SyncStats`.
- **#6** — env parsing consolidated in `loadConfig()`.
- **#8** — reusable `mapWithConcurrency()` helper.
- **#9** — magic numbers named (`PAGE_SIZE`, `RETRY_MAX_DELAY_MS`, etc.).

**Shared modules (the point #2 "one module" caveat):**

- `scripts/new-2026/constants.ts` — added `buildLegacyValues`, `getHashValues`, `getHash`.
- `scripts/new-2026/types.ts` — added shared `PricePoint`, `MigratedProduct`, `MigratedData`.
- `scripts/new-2026/migrate.ts` — now imports those instead of local duplicates.
- `package.json` — added `bun run` scripts: `migrate` and `sync`.

### Notes / caveats

- **Design insight that makes this fast:** every `usedForHashing: true` field comes from the search API,
  so change detection needs no detail fetch. Transient detail-fetch failures keep the previous entry
  (no data loss).
- `new-setup.ts` left untouched (the old working scraper) rather than deleted — remove once `index.ts`
  is confirmed as its replacement.
- Couldn't execute the scripts here: the terminal runs locally while this is a Live Share workspace, so
  Bun can't see the files. Validation is via the VS Code language server (no errors).
- Two pre-existing WIP schema gaps unrelated to this refactor — `certificateId` (Erityisryhmä) and
  `moreInfo` (Huomautus) aren't present on either API type, so those columns stay `null`/`false` on sync
  until mapped.

---

## Follow-up changes (2026-07-14)

### 11. Never delete products — flag them instead

Products are no longer dropped from the dataset when they disappear from Alko's search response.
Instead, each product carries an optional, non-schema metadata object.

- **`scripts/new-2026/types.ts`** — added a `ProductMeta` type and an optional `meta?: ProductMeta`
  field on `MigratedProduct`. The first property is `removedFromSelection` (an ISO `YYYY-MM-DD` date),
  and the object is intentionally extensible for future lifecycle flags.
- **`scripts/new-2026/index.ts`**:
  - Products present in the existing dataset but missing from the latest search response are now
    **carried over** and flagged with `meta.removedFromSelection = <today>` (set once; already-flagged
    products are kept as-is).
  - When a flagged product reappears in the search results, the flag is cleared automatically via the
    new `clearRemovedFlag()` helper (with `withoutRemovedFlag()` preserving any other future meta keys).
  - The `SyncStats.removed` counter now means "newly flagged as removed this run" rather than
    "deleted"; the summary line reads `🚫 Removed from selection`.

### 12. Progress logging while fetching product details

The detail-fetch pass now reports incremental progress instead of running silently.

- **`scripts/new-2026/index.ts`** — a shared counter logs `📥 N/total details fetched` every
  `PROGRESS_LOG_INTERVAL` (25) products and again on the final product, so long sync runs show
  live progress (e.g. `25/200`, `50/200`, … `200/200`).

### 13. Focus the change-detection hash on lifecycle fields

Tuned which columns feed the change-detection hash (`usedForHashing`) so the cheap first pass tracks
fields that actually change over a product's lifecycle, rather than static identity attributes.

**Constraint that drives the choice:** the first pass hashes only the **search-API** payload and
re-fetches full details only when the hash differs. So a hashed field must (a) exist in
`SearchProductData` — otherwise it's `null` on the first pass but non-null in the stored merged hash,
forcing a re-fetch every run — (b) change meaningfully over the lifecycle, and (c) not be noisy.

- **`scripts/new-2026/constants.ts`** — `FIELD_TO_LEGACY_SCHEMA` updated:
  - **Kept hashed (lifecycle / correction signals, all search-API fields):** `price` (Hinta),
    `selectionTypes` (Valikoima) — the two core lifecycle fields — plus `name` (Nimi),
    `abv` (Alkoholi-%) and `taste` (Luonnehdinta) as low-cost data-correction tripwires.
  - **Dropped from hashing (static identity attributes / redundant):** `id` (Numero, redundant — it's
    the record key), `volume` (Pullokoko), `countryName` (Valmistusmaa), `packageTypes` (Pakkaustyyppi)
    and `closures` (Suljentatyyppi).

**Notes / caveats:**

- `Uutuus` (new tag) and `vintage` are genuinely lifecycle-relevant but are **detail-only** fields, so
  they can't join the cheap search-API hash without breaking the optimization — they're only observable
  via a full detail fetch.
- Stock/availability fields (`webshopStock`, `onlineAvailability`, `limeStock`) are dynamic but
  deliberately excluded: they fluctuate constantly and would trigger a detail re-fetch almost every run.
- Changing the hashed set means existing stored hashes will differ on the next run, so the first sync
  after this change re-fetches details for affected products once, then stabilizes.

### 14. Align the migration hash with the sync hash domain

Fixed a bug where the first sync after migration re-fetched details for **every** product instead of
only the changed ones.

**Root cause:** `migrate.ts` and `index.ts` computed the change-detection hash over *different
representations* of the same fields, so the stored migration hash could never equal the sync hash.

- `migrate.ts` built `values` straight from the **raw legacy columns** and hashed them as-is, so the
  hashed fields were legacy strings: `price` `"14.97"`, `abv` `"38.0"`, `taste`
  `"Keltainen, lämmin, ..."` (a comma-string).
- `index.ts` computes the comparison hash from `buildLegacyValues(searchProduct)`, which runs the
  preprocessors: `price` → number `14.97`, `abv` → number `38`, `taste` → array
  `["Keltainen", " lämmin", ...]`.

Because `getHash` uses `JSON.stringify`, `"14.97" !== 14.97`, `"38.0" !== 38`, and the comma-string
never equals the array. Every migrated hash mismatched → details fetched for all products.

- **`scripts/new-2026/migrate.ts`** — added a `normalizeHashValues()` helper that converts only the
  hashed columns into the same shape `buildLegacyValues` produces before hashing (`Hinta` → number,
  `Alkoholi-%` → number, `Luonnehdinta` → `.split(",")` array, matching the sync preprocessor exactly).
  The stored `values` are left untouched — the app's loader already tolerates both string and
  array/number forms — so only the change-detection hash moves into the sync's domain.

**Notes / caveats:**

- `data-migrated.json` must be **regenerated** by re-running the migration; the existing file still
  holds the old hashes, so a sync against it keeps refetching until it's rebuilt.
- The match relies on the legacy `Luonnehdinta` text and `Valikoima` value being identical to the API's
  for unchanged products. Any product where those genuinely differ (e.g. a real price change) is still
  refetched — which is the correct behavior, since those are hash fields.


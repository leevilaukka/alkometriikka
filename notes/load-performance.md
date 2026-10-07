# Load performance

The site is client-rendered (`ssr = false`), so nothing shows until `data.json`
is fetched, parsed and indexed into a `Kaljakori`. Measured on the real
gh-pages data from 2026-10-07: 13 778 products, 359 stores, data.json 8.7 MB
(1.9 MB gzipped), availability.json 4.2 MB (0.9 MB gzipped).

## Benchmark (`scripts/bench/load-bench.ts`, desktop Bun, medians)

```sh
bun run scripts/bench/load-bench.ts                     # synthetic data
bun run scripts/bench/load-bench.ts --data static/data.json --availability static/availability.json [--with-index]
```

| Step                                    | Before   | After                          |
| --------------------------------------- | -------- | ------------------------------ |
| parseDataset (incl. JSON.parse)         | ~60 ms   | ~60 ms                         |
| `new Kaljakori`, no availability        | ~540 ms  | ~200 ms                        |
| `new Kaljakori`, with availability      | ~640 ms  | ~260 ms                        |
| Filter values/types/ranges (lazy)       | included | ~110 ms with index, ~200 ms without |
| `fuzzySearchAndFilter('')`              | ~12 ms   | ~3 ms                          |
| `fuzzySearchAndFilter('lapin')`         | ~24 ms   | ~40–55 ms (now matches every word, see below) |

## Browser (Chromium, 4x CPU throttling, local server, time to first content, medians)

| Page                                     | Before  | After   |
| ---------------------------------------- | ------- | ------- |
| `/` main list                            | ~8.6 s  | ~8.7 s  |
| `/?Myymälät=…` (store filter in URL)     | ~8.7 s  | ~7.5 s  |
| `/kategoriat/viinit/`                    | ~12.1 s | ~9.8 s  |
| `/tilastot/`                             | ~16.8 s | ~12.5 s |
| `/tuotteet/100001/`                      | ~10.0 s | ~9.6 s  |

Profiles show ~1.5 s less main-thread work before the main list appears
(Kaljakori ~3.8 s → ~1.4 s + ~1.1 s lazy filter index at 4x), but time to
first content on `/` did not move in these runs (single runs vary by ±0.8 s).
What remains there: rendering Main and the filter sidebar (which needs every
filter's options, including all ~13k names, on first render), the initial
filter pass over all products with the default numeric ranges (~0.75 s at 4x,
unchanged), and availability parsing (~0.6 s at 4x), which now waits for
`requestIdleCallback` but still lands between the list's render frames.

## What changed

- Kaljakori parses each row once with per-column parsers and builds filter
  values, types and ranges lazily into sets (no array spreads, no second
  pass for the "active" values).
- The sync stores precomputed filter values for low-cardinality columns in
  data.json under `index` (~30 KB gzipped). Kaljakori uses it only when it
  matches the products and computes everything else.
- Stats, Category and List reuse the layout's Kaljakori via `subset()`.
- availability.json no longer blocks rendering; pages that can't render
  without it await `alkoWithStores`.
- `fuzzySearch` now fuzzy-matches every word, not just the first one.

## Not done, and why

- **Splitting out price history:** only ~6% of the gzipped download and a few
  ms to parse, and the category, product and price-change pages need it.
- **Web Worker:** time to content would still wait for the data, and
  structured-cloning 13.7k products (with Sets) back to the main thread is a
  large main-thread cost of its own.

## Change-detection hashes moved out of data.json

The per-product `hash` (64 hex characters each, barely compressible) was ~⅓ of
the gzipped data.json and is only used by the sync. It now lives in
`hashes.json` next to data.json (see `scripts/data/dataset-file.ts` and
`notes/deployment.md`). On the real data: data.json 1.92 MB → 1.31 MB gzipped
(8.7 MB → 7.8 MB raw), including the ~30 KB filter index; hashes.json is
0.55 MB gzipped and is never loaded by the site.

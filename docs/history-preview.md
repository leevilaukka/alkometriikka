# Historical-price working set

The app combines its current catalog with recovered price observations from 246
dated snapshots (2007–2026). Product charts label archive observations and keep
unknown periods as gaps. `/historia/` provides the source explorer.

## Application integration

`bun run history:merge --dev` merges verified bundled archive observations into
the existing `static/data.json` and writes `static/history-preview.json`. It
requires an existing catalog; it never restores the captured catalog, availability,
or image manifest. Omit `--dev` to operate on the root dataset used by CI.

The normal build and the build workflow run this merge before building assets.
Live synchronization runs the same merge before writing its dataset, and the
deployment workflow carries the source report alongside it. No live service is
changed until this branch is merged and deployed.

Each merge rechecks product number, normalized name, and bottle size against the
current catalog, removes the previous generated archive layer, and reconstructs
it deterministically. Only ranges ending before the first live observation are
accepted. Ranges overlapping the live era are conservatively excluded in full.
Current values, hashes, lifecycle flags, and live price observations are retained.
Archive observations are excluded from RSS and recent price-change summaries.

The explorer's product counts describe the current merge. Its rejected matches
and conflicts retain the original recovery audit against the captured catalog.

## Run from this checkout

The compressed working dataset and supporting files are included in
[`data/history-preview/`](../data/history-preview/README.md). With Bun installed:

```sh
bun install --frozen-lockfile
bun run dev:history
```

`dev:history` verifies the bundled files, restores them into `static/`, then starts
Vite without syncing live data. It works without the original research folder.
To restore data without starting a server, run `bun run history:prepare`.
You can pass Vite options, for example `bun run dev:history --port 5173`.

The bundled data is the same working set used in the private hosted preview.
The local project retains its usual uncompressed `data.json` loading; no hosting
configuration or compressed browser loader is needed here.

## Rebuild from recovered observations

To regenerate the working set with Python 3.11+ (standard library only), use your
recovered source folder and captured base catalog:

```sh
python scripts/data/prepare-history-preview.py \
  --research /path/to/alko-history-research \
  --base /path/to/alkometriikka-current-data.json \
  --out static
bun run dev:no-sync --host 0.0.0.0 --port 5173
```

Open `/historia/` to search matched products, browse source links and hashes,
inspect rejected identity matches and recorded-price conflicts, and download the
working JSON. Example: `/tuotteet/319027/` opens Gambina with its expanded chart.

Generated files are ignored by Git:

- `static/data.json`: the current catalog plus historical observations.
- `static/history-preview.json`: source manifest, product index and review report.
- `static/availability.json`: captured store data, seeded separately from the same
  `gh-pages` deployment so product pages work offline from Alko's API.

`dev:no-sync` is intentional: `dev` runs the live sync and can replace this preview.
The preview is prepared from the 2026-10-15 capture; its displayed current prices
and availability are from that capture, not a new live fetch.

## Matching and evidence

An observation must match product number, numeric bottle volume in litres and
normalized name. Name matching ignores punctuation, case, accents and four-digit
vintage years; it does not use fuzzy matching. This is SKU history across vintages,
not proof that bottles from different years are identical. Mismatched names or
sizes remain in the review report. IDs absent from the base catalog are excluded.

The importer preserves catalog values, lifecycle flags and every existing live
price point, including campaign metadata. An archive disagreement on a recorded
date is quarantined and never overwrites that recorded price.

Equal archive prices are compacted while retaining each consecutive observed-date
range. Gaps remain explicit. Each compacted point retains its first and last source
IDs; the report maps them to original URLs and full hashes. The source observation
CSV and original recovered files remain the complete evidence archive.

Charts use elapsed dates, separate unknown periods and label archive observations.
Source links are available below each product's chart. An observed price difference
does not establish the exact date on which Alko changed its price.

The generator accepts its own previous output as the base, strips the generated
archive layer and deterministically rebuilds it from the retained live baseline.

## Validation

```sh
python -m unittest discover -s tests/data -p '*_test.py'
bun test tests/utils/priceHistory.test.ts tests/data
bun run check
```

Focused tests verify matching, conflicting dates, campaign preservation, repeated
imports, compacted observation ranges, date spacing and gaps in the chart.
The integration does not publish reconstructed change events into RSS feeds.

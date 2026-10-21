# Bundled historical-price working set

These compressed files let `bun run dev:history` run the historical-price preview
from this checkout without downloading source files or using the research folder.
The complete bundle is approximately 3.8 MiB. `manifest.json` records the exact
uncompressed sizes and SHA-256 hashes, verified before restoring runtime files.

- `data.json.gz`: the 2026-10-15 catalog plus 68,180 archived price points across
  11,909 products. The catalog's original 22,230 price points are retained.
- `history-preview.json.gz`: source URLs, hashes, product summaries, unmatched
  identities and conflicting observations held for review.
- `availability.json.gz` and `og-images.json.gz`: captured supporting data from
  the same catalog deployment.

The source collection contains 2,288,101 observations over 246 snapshot dates from
2007 to 2026. Conservative matching accepts 1,943,960 observations; the report
keeps the original URLs and source hashes. Missing dates remain gaps in charts.
Current prices and availability in this bundle are a dated capture.

See [the working-set documentation](../../docs/history-preview.md) for provenance,
matching rules and rebuilding from the original recovered observations. Changes
to the compressed files must update the manifest from their uncompressed bytes.

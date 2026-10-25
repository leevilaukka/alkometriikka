# Stock history

`availability.json` is rewritten on every sync, so on its own it can only say where a product is
in stock _now_. The stock history keeps the last 90 days of it in a compact form, for:

- the store count trend on product pages ("−12 myymälää 30 päivässä", `ProductStockTrend`)
- "Tullut myymälään" on store pages: products that arrived in a store in the last 30 days

Code: `scripts/data/stock.ts` (the update, pure), `scripts/data/stock-history.ts` (the CLI),
`src/lib/utils/catalog/stock.ts` (file format, constants and readers shared with the site),
`src/lib/alko/stock.ts` (fetching in the browser).

## Files

Everything lives under `stock/` on `gh-pages`, next to `availability.json`.

| File                       | Size (Oct 2026, gzipped)  | Read by       | Contents                                          |
| -------------------------- | ------------------------- | ------------- | ------------------------------------------------- |
| `stock/state.json`         | ~0.4 MB, growing to ~1 MB | The CLI only  | Everything needed between runs (below)            |
| `stock/products/<NN>.json` | ~2 KB each, 100 files     | Product pages | Daily store counts of the products ending in `NN` |
| `stock/stores/<id>.json`   | under 1 KB each           | Store pages   | That store's recent arrivals                      |

```jsonc
// stock/products/58.json: products whose number ends in 58
{
	"start": "2026-07-23", // the day of each array's first entry
	"counts": { "906458": [34, 34, null, 33, …] } // stores per day; null = not in the selection, or no run that day
}

// stock/stores/2102.json
{
	"since": "2026-07-23", // when the history began
	"arrivals": [["906458", "2026-10-20"], …] // still-stocked arrivals of the last 30 days, newest first
}
```

`state.json` holds `since`, `start`, `last`, the `counts` of every product, and per store two maps
of product → date: `gone` (out of the store for less than the return gap, with the last day it was
there) and `arrivals`.

## Updating

Each `fetchData.yml` deploy runs, before the new `availability.json` replaces the deployed one:

```sh
bun run scripts/data/stock-history.ts --availability availability.json \
  --previous ../gh-pages/availability.json --dir ../gh-pages/stock
```

- **Counts**: today's slot (Helsinki date) gets each product's number of stores, counting only
  stores in the store list (pickup points aren't). Runs later the same day overwrite it. Days
  without a run stay `null`. Older than 90 days is dropped, and so is a product with nothing left.
- **Arrivals** compare the store lists in `--previous` (the last run's availability) and the
  current one. A product in a store now but not before has arrived, unless it was gone for less
  than **14 days** (`STOCK_RETURN_GAP_DAYS`): that's a sold-out shelf being restocked, not
  something new. Without `--previous` only the counts update.
- **Warm-up**: the history can't know what was in a store before it began, so arrivals are only
  recorded from 14 days after `since`. Until then store pages show no arrivals section.
- Stores new to the store list are skipped for a run (their whole selection would "arrive"), and
  closed stores are dropped.

The step is `continue-on-error`: a failed run only loses that run's data point. `build.yml`
restores `stock/` from `gh-pages` before its force-push, like `rss/`.

The files aren't purged from Cloudflare after a deploy (there are ~460 of them), so a cached copy
can lag by the edge cache's lifetime. They change at most daily, so that's fine.

## Locally

`static/stock/` is gitignored. To try the pages that use it without weeks of history:

```sh
bun run stock:demo   # fakes 30 days from static/availability.json into static/stock/
bun run stock -- --dev --previous <older availability.json>   # a real update
```

The demo walks back from today's availability, removing some products from some stores on
earlier days, so trends and arrivals show up. It refuses to write anywhere outside `static/`.

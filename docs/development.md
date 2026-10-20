# Development

## Requirements

- [Bun](https://bun.sh/) (scripts, tests and package management all use Bun)
- Git (the build reads the current commit hash for the app version)

## Setup

```sh
bun install
bun run dev
```

`bun run dev` first runs the data sync against Alko's API in dev mode
(`scripts/data/index.ts --dev`, verbose), writing `static/data.json`, `static/hashes.json` and
`static/availability.json`, then starts Vite on all interfaces. The first sync with no existing
`static/data.json` fetches details for every product and takes a while.

To skip the sync and reuse the files already in `static/`:

```sh
bun run dev:no-sync
```

If you don't want to sync at all, download the live files once and put them in `static/`:
`https://alkometriikka.fi/data.json` and `https://alkometriikka.fi/availability.json`.

### Daily game locally

The Daily page fetches `/daily/<today>.json`. Bake manifests into `static/daily/` with:

```sh
bun run daily --dev
```

## npm scripts

| Script                                    | What it runs                                                                    |
| ----------------------------------------- | ------------------------------------------------------------------------------- |
| `dev`                                     | Sync in dev mode, then `vite dev --host`                                        |
| `dev:no-sync`                             | `vite dev --host`                                                               |
| `build`                                   | `vite build`, then product/category and static/store prerendering into `build/` |
| `preview`                                 | `vite preview` of the build                                                     |
| `check` / `check:watch`                   | `svelte-kit sync` + `svelte-check`                                              |
| `test`                                    | `bun test`                                                                      |
| `format` / `lint`                         | Prettier write / check                                                          |
| `sync`                                    | `scripts/data/index.ts` (add `--dev` to use `static/`)                          |
| `migrate`                                 | One-off legacy XLSX dataset migration (`scripts/data/migrate.ts`)               |
| `daily`                                   | Bake Daily manifests and archive finished days                                  |
| `backup:daily`                            | Upload the Daily archive tarball to R2                                          |
| `og:images`                               | Render/upload product OG images                                                 |
| `pwa:splash`                              | Regenerate the iOS launch screens and their script in `src/app.html`            |
| `sitemap`                                 | Write `sitemap.xml`                                                             |
| `prerender:products` / `prerender:static` | The two prerender steps of `build`, runnable on their own                       |
| `r2`                                      | R2 maintenance CLI (`count`, `list`, `rm`, `prune-daily`)                       |

Scripts not wired to an npm script are run directly with `bun run <path>`, for example
`bun run scripts/site/rss.ts`, `scripts/data/rehash.ts` and `scripts/og/og-categories.ts`.

## The `--dev` convention

Every data script reads and writes in the repo root by default, which is what CI does, and in
`static/` when passed `--dev`, so that Vite serves the files at the same URLs as production:

| File              | CI path               | `--dev` path                 |
| ----------------- | --------------------- | ---------------------------- |
| Dataset           | `./data.json`         | `./static/data.json`         |
| Hashes            | `./hashes.json`       | `./static/hashes.json`       |
| Availability      | `./availability.json` | `./static/availability.json` |
| Daily manifests   | `./daily/`            | `./static/daily/`            |
| OG manifest (RSS) | `./og-images.json`    | `./static/og-images.json`    |

All of these are gitignored. None of the runtime data is committed to `main`; it only exists on
`gh-pages`.

## Environment variables

Bun loads `.env` automatically. Copy `.env.example` for the R2 credentials.

| Variable                                                             | Used by            | Purpose                                                                    |
| -------------------------------------------------------------------- | ------------------ | -------------------------------------------------------------------------- |
| `BASE_PATH`                                                          | `svelte.config.js` | Build under a sub-path (branch previews). Ignored in `vite dev`            |
| `VERBOSE`                                                            | sync               | `1`/`true` logs config, per-field diffs and response headers               |
| `ALKO_SYNC_FORCE`                                                    | sync               | Write even when safeguards reject the result, or when starting fresh in CI |
| `ALKO_DETAIL_CONCURRENCY`                                            | sync               | Parallel detail requests (default 4, CI uses 8)                            |
| `ALKO_SEARCH_CONCURRENCY`                                            | sync               | Parallel search pages (default 3)                                          |
| `ALKO_MAX_RETRIES`                                                   | sync               | Retries per request (default 5)                                            |
| `ALKO_MAX_PAGES`                                                     | sync               | Cap on search pages, for quick local runs                                  |
| `ALKO_DETAIL_VERIFY_COOLDOWN_DAYS`                                   | sync               | Days before an unchanged product's details are re-verified (default 30)    |
| `ALKO_DETAIL_VERIFY_BATCH`                                           | sync               | Max re-verifications per run (default 200)                                 |
| `ALKO_DETAIL_VERIFY_IN_DEV`                                          | sync               | Run the re-verification pass in `--dev` too                                |
| `ALKO_SYNC_REPORT`, `ALKO_SYNC_ATTEMPT`                              | sync               | Append each attempt's outcome to this file, for run monitoring (CI only)   |
| `ALKO_PRERENDER_CONCURRENCY`                                         | prerender-products | Parallel page writes (default 32)                                          |
| `DAILY_AHEAD_DAYS`                                                   | daily              | Future days to pre-bake (default 2)                                        |
| `DAILY_ALLOW_EMPTY`                                                  | daily              | Allow baking without a seeded `daily/` (new deployments only)              |
| `CF_R2_ACCESS_KEY_ID`, `CF_R2_SECRET_ACCESS_KEY`, `CF_R2_ACCOUNT_ID` | OG, backup, r2 CLI | R2 S3 credentials                                                          |
| `CF_R2_BUCKET`                                                       | OG, backup, r2 CLI | Bucket name (default `alkometriikka-og`)                                   |
| `CF_R2_REGION`                                                       | OG, backup, r2 CLI | R2 jurisdiction subdomain (default `eu`)                                   |
| `OG_CDN_BASE`                                                        | OG, prerender, RSS | Public base URL of the bucket (default `https://cdn.alkometriikka.fi`)     |
| `OG_DESIGN_VERSION`                                                  | OG                 | Mixed into the OG design fingerprint; bump to force a full re-render       |

`.env.example` also lists `OG_CONCURRENCY`, but nothing reads it. The OG scripts take a
`--concurrency <n>` flag instead (default 16 for products, 8 for categories).

## Tests

```sh
bunx svelte-kit sync   # once, so $lib and $app resolve
bun test
bun test tests/data    # one directory
```

Tests use `bun:test` and need no network. They mirror the source layout:

| Directory      | Covers                                                                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `tests/data/`  | Dataset read/write and hash split, filter index, schema writer↔reader agreement, product lifecycle across syncs, safeguards                                  |
| `tests/alko/`  | `Kaljakori` parsing, calculated columns, removed products, querying, late-loading availability                                                               |
| `tests/daily/` | Question generator, manifest round trip, the pinned-manifest guard, bake → play → archive → backup lifecycle, archive backup                                 |
| `tests/site/`  | Daily baking against temp dirs, stub rendering, and a lint that forbids hardcoded root-relative links in `src/`                                              |
| `tests/og/`    | Category OG card numbers and keys                                                                                                                            |
| `tests/utils/` | Categories, compare, compass, filters, food labels, metrics, notices (including `static/notices.json` itself), price changes, size matching, sales, SEO copy |

Some tests are guards rather than unit tests, and CI depends on them:

- **`tests/daily/manifest.test.ts`** rebuilds a pinned manifest from
  `tests/daily/fixtures/pinned-manifest.json`. If you change the Daily generator without bumping
  `DAILY_GAME_VERSION`, it fails. See [Daily game](daily-game.md#versioning).
- **`tests/utils/notices.test.ts`** fails if any entry in `static/notices.json` would be dropped
  by the parser.
- **`tests/site/base-path.test.ts`** fails on `href="/…"`, `goto('/…')`, `fetch('/…')` and
  similar in `src/`. Use `resolve()` / `asset()` from `$app/paths`, or `appPath()` from
  `$lib/utils/app/paths` for paths only known as strings.

CI runs the whole suite on every push and PR (`test.yml`), and `build.yml` runs it before deploying.
The data sync runs `tests/data tests/alko` first, and every Daily bake runs `tests/daily tests/site`.

## Benchmarks

`scripts/bench/load-bench.ts` measures dataset parsing, `Kaljakori` construction and search:

```sh
bun run scripts/bench/load-bench.ts                     # synthetic data
bun run scripts/bench/load-bench.ts --data static/data.json --availability static/availability.json
```

Results and history are in [`notes/load-performance.md`](../notes/load-performance.md).

## Conventions

- **Formatting:** Prettier with tabs, single quotes, no trailing commas, width 100, plus the
  Svelte and Tailwind plugins. Run `bun run format`.
- **Language:** code, comments and commit messages are in English. User-facing text is Finnish.
  Dataset column names stay in Finnish because they are the on-disk schema; refer to them through
  `AllColumns` / `DatasetColumns` in `src/lib/utils/constants/columns.ts`, never as string literals.
- **Svelte 5 runes** (`$state`, `$derived`, `$effect`) throughout. Shared state lives in
  `src/lib/global.svelte.ts`.
- **Styling:** Tailwind v4 with theme tokens and utilities in `src/app.css` (`bg-primary`,
  `bg-secondary`, `border-primary`, `text-secondary`, brand colors `brand-1`…`brand-4`).
  Reusable variants are `class-variance-authority` recipes in `src/lib/utils/ui/styles.ts`
  (`components.button()`, `components.input()`…), merged with `tailwind-merge`. Dark mode is a
  `.dark` class on `<html>`.
- **Icons:** an icon font (`src/lib/assets/fonts/icons/`) rendered by `Icon.svelte`; valid names
  are the `IconName` union in `src/lib/icons.ts`.
- **Links:** never hardcode a leading `/` (see the base-path test above).
- **Production builds drop `console.*`** (`vite.config.ts`), so use the console freely for
  debugging but don't rely on it for anything users need.
- **Shared code between app and scripts** goes in a module free of `$lib` imports and browser
  globals (see [Architecture](architecture.md#repository-layout)).

# Daily game

Alkometriikka Daily (`/daily`) is a seven-question quiz built from the catalog. Every visitor gets
the same questions on a given day, the game flips at midnight Finnish time, and past days stay
playable in the archive.

Code: `src/lib/daily/` (shared by the app and the pipeline), `src/routes/daily/`,
`scripts/site/daily.ts`, `scripts/site/daily-bake.ts`, `scripts/site/backup-archive.ts`,
`scripts/og/og-daily*.ts`, `scripts/site/prerender-daily.ts`.

## Why the game is baked ahead of time

Generating the game in the browser from the live `data.json` can't guarantee the same game for
everyone: the data is re-synced every 6 hours, so prices and the product set change during the
day. Instead, the pipeline **bakes** each day once and pins it to a file. The first sync that sees
a date decides that date's game forever.

## Questions

`generateDailyGame(date, products, rng)` in `src/lib/daily/questions.ts` builds
`DAILY_QUESTION_COUNT = 7` questions. It shuffles twelve question builders and takes them in order
until seven succeed (a builder fails when, say, two candidates have the same value), topping up
with price questions if needed.

| Type         | Variants                                             | Asks                                                   | Points      |
| ------------ | ---------------------------------------------------- | ------------------------------------------------------ | ----------- |
| `price`      | —                                                    | Which of four prices is this product's?                | 100 or 0    |
| `cheaper`    | —                                                    | Which of two products is cheaper?                      | 100 or 0    |
| `efficiency` | —                                                    | Which gives more alcohol per euro?                     | 100 or 0    |
| `estimate`   | —                                                    | Guess the price, given volume and ABV                  | `100 × e^(− | guess − price | / max(price, 1))`, rounded |
| `attribute`  | `alcohol`, `volume`, `literPrice`, `sugar`, `energy` | Which of two has more (or a lower price per litre)?    | 100 or 0    |
| `choice`     | `country`, `manufacturer`, `category`                | Which of up to four options is right for this product? | 100 or 0    |

Products are picked without repeats where possible, and new products (Uutuus) are three times as
likely to be picked. Scoring is in `src/lib/daily/scoring.ts`; the maximum is 700.

All randomness comes from `createRng(seed)` in `src/lib/daily/rng.ts` (an FNV-1a string hash
feeding a small 32-bit PRNG), so the same seed and products always produce the same game.

## Manifests

`generateDailyGameManifest(date, catalog)` (`src/lib/daily/manifest.ts`) produces the file served
at `/daily/<YYYY-MM-DD>.json`:

```jsonc
{
	"version": 8, // DAILY_GAME_VERSION
	"date": "2026-10-13",
	"seed": "9f2c…", // 16 random bytes, hex
	"gameHash": "a41b…", // SHA-256 of the canonical game JSON
	"products": [/* 24 trimmed products */]
}
```

1. Pick a random seed.
2. Shuffle the valid catalog with an RNG seeded by the date, the seed and an attempt number, and
   take `DAILY_POOL_SIZE = 24` products, trimmed to the columns the generator reads.
3. Generate the game from that trimmed pool. If it doesn't have 7 questions with at least
   `DAILY_MIN_VARIANTS = 5` distinct variants, retry with the next attempt (up to 8).
4. Store the seed, the pool and the hash of the game, **not the game itself**.

The browser rebuilds the game from the seed and pool (`reconstructDailyGame`) and checks it
against `gameHash`. So the correct answers never appear in the JSON, and a client running
different generator code gets a mismatch instead of a different game.

### Baking

`bun run daily` (`scripts/site/daily.ts` → `bakeManifests`, `bakeArchive` in `daily-bake.ts`):

- Writes manifests for today (Europe/Helsinki) and the next `DAILY_AHEAD_DAYS` (default 2) days.
  Because tomorrow is already baked, the client can switch exactly at midnight.
- Never rewrites a date that already has a current-version manifest.
- Refuses to run in CI if `daily/` wasn't seeded from `gh-pages` first, because baking into an
  empty directory would re-roll games players are already playing. `DAILY_ALLOW_EMPTY=1` overrides
  it for a brand-new deployment.

## Archive

Once a day is over its answers are public, so the archive stores the full game.

- `bakeArchive` converts every manifest dated before today that isn't archived yet into
  `daily/archive/<date>.json`: the resolved game plus display data (name, price, producer, type,
  packaging) for each product it uses. Archived days therefore keep working after products leave
  the catalog and after the generator changes.
- Archive files are immutable. Re-runs only add missing dates.
- `daily/archive/index.json` lists the available dates, newest first.
- Only manifests of the current `DAILY_GAME_VERSION` are archived.
- Old `daily/arkisto/` and `daily/arkisto-data/` folders from an earlier layout are migrated into
  `daily/archive/` on bake.

Manifests themselves are kept forever too (about 6 KB each).

### Backup

`bun run backup:daily` (`scripts/site/backup-archive.ts`) packs `daily/archive/*.json` into a
gzipped tarball and uploads it to R2 as `daily-archive.tar.gz`. It refuses (exit code 3) to
overwrite a backup that holds more files than the new one, since a shrinking archive means files
were lost on `gh-pages`. `--force` overrides that.

## Schedule

| When                                                                   | Workflow           | What happens                                                                                                                       |
| ---------------------------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| 21:15 and 22:15 UTC (just after Finnish midnight in summer and winter) | `archiveDaily.yml` | Bake, archive yesterday, back up to R2, render today's OG card and stub, publish `daily/`, purge the archive index from Cloudflare |
| Every 6 hours, and after each deploy                                   | `fetchData.yml`    | Bake with fresh data (fills in future days), render the OG card again as a fallback                                                |
| Push to `main`                                                         | `build.yml`        | Restores the deployed `daily/` into the build output and refuses to deploy without it                                              |

All three run the Daily and site tests before baking. See [CI/CD](ci-cd.md).

## Versioning

`DAILY_GAME_VERSION` in `src/lib/daily/questions.ts` must be bumped whenever the generated game for
the same seed and pool changes: edits to `questions.ts`, `rng.ts`, or the pool/trim logic in
`manifest.ts`.

`tests/daily/manifest.test.ts` enforces this. It rebuilds a real baked manifest
(`tests/daily/fixtures/pinned-manifest.json`) and fails if the rebuilt game no longer matches its
hash, or if the fixture's version differs from `DAILY_GAME_VERSION`. CI won't deploy or bake until
it passes.

A bump has costs, listed in the comment above the constant:

- The baker re-bakes today, so the live game changes mid-day.
- Every player's saved progress for today is discarded.
- Finished days not yet archived are never archived, because only current-version manifests are.
  Deploy a bump **after** the 00:15 archive run.
- Until `fetchData.yml` re-bakes (it runs right after the build), clients reject the old manifests
  and show an error.

After a bump, replace the fixture with a freshly baked manifest so the guard passes again:
run `bun run daily --dev` and copy one of the files from `static/daily/` over
`tests/daily/fixtures/pinned-manifest.json`.

## Day numbers

`DAILY_LAUNCH_DATE = '2026-09-22'` is day #1 (`src/lib/daily/dayNumber.ts`). Day numbers are pure
date arithmetic so the client, the OG card and the stub agree without reading the archive. Never
change the launch date.

## Playing

`src/routes/daily/+page.svelte`

1. Work out today's date in Europe/Helsinki.
2. Restore saved progress for today if it exists and matches the current version.
3. Otherwise fetch `/daily/<date>.json` (3 attempts), rebuild the game and verify its hash. In
   production a missing or unverifiable manifest shows an error rather than falling back to a
   locally generated game.
4. Product names and prices come from the manifest's frozen pool, so they match the day the game
   was baked even if prices have changed since. Product photos come from Alko's CDN.

After finishing, the player sees their score and streak and can share a result. They can then
play **unlimited** rounds: games generated locally from the live catalog with a random seed,
which don't count towards the streak.

### Archive pages

- `/daily/arkisto` shows a month calendar of available dates (from `daily/archive/index.json`)
  with the player's past scores.
- `/daily/arkisto/<date>` plays an archived game. A day already played live is shown read-only
  with the answers. Archive runs are saved separately and don't affect the streak.

### Player state

All in localStorage (keys in `LocalStorageKeys`):

| Key                                     | Holds                                                          |
| --------------------------------------- | -------------------------------------------------------------- |
| `alkometriikka-daily-v1`                | Today's game and progress (`SavedDailyGame`)                   |
| `alkometriikka-daily-streak-v1`         | Current and best streak, last completed date                   |
| `alkometriikka-daily-unlimited-v1`      | In-progress unlimited round                                    |
| `alkometriikka-daily-unlimited-enabled` | Whether unlimited mode is offered                              |
| `alkometriikka-daily-archive-scores-v1` | Score per date, from live and archive play                     |
| `alkometriikka-daily-archive-runs-v1`   | In-progress and finished archive runs, with answers for review |

The streak continues when the previous completed date is exactly yesterday (UTC date arithmetic,
so it works in every time zone).

## Share card and stub

Link previews for `/daily/` need an image and tags that change daily, but crawlers don't run the
SPA. So each day:

- `scripts/og/og-daily.ts` renders a 1200×630 card with the date and day number and uploads it
  to R2 as `daily/<date>.png`. It overwrites, so re-runs are harmless.
- `scripts/site/prerender-daily.ts` writes `daily/index.html`, a stub whose OG and Twitter tags
  point at that day's card, with `Quiz` JSON-LD.

The composite action `.github/actions/daily-og` runs both, in that order, and stops if the upload
fails so the stub never points at a missing image. It is marked `continue-on-error` in the
workflows because it's decorative.

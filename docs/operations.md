# Operations runbook

Common maintenance tasks and what to do when something breaks.

## Posting a notice

Edit [`static/notices.json`](../static/notices.json) on `main` (the GitHub web editor is fine).
The push deploys it and `build.yml` purges it from Cloudflare, so it's live within minutes.

```json
{
	"$schema": "../schemas/notices.schema.json",
	"notices": [
		{
			"id": "alko-api-2026-10",
			"level": "warning",
			"message": "Alkon rajapinta muuttui, eikä hintoja saada päivitettyä. Korjaus on työn alla.",
			"link": {
				"href": "https://github.com/leevilaukka/alkometriikka/issues/123",
				"label": "Lisätietoja"
			},
			"expiresAt": "2026-10-20T00:00:00Z",
			"replacesStaleWarning": true
		}
	]
}
```

| Field                   | Default | Notes                                                                                                                                                                                                                                  |
| ----------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                    | —       | Required. Dismissals are remembered per id; use a new id to show it again                                                                                                                                                              |
| `message`               | —       | Required. Plain text                                                                                                                                                                                                                   |
| `level`                 | `info`  | `info` or `warning`                                                                                                                                                                                                                    |
| `link`                  | —       | `{ href, label }`. `href` must start with `/` or `https://`                                                                                                                                                                            |
| `startsAt`, `expiresAt` | —       | ISO timestamps. Expired notices disappear on their own                                                                                                                                                                                 |
| `dismissible`           | `true`  | `false` keeps it up                                                                                                                                                                                                                    |
| `replacesStaleWarning`  | `false` | Hides the automatic "data is stale" warning while active                                                                                                                                                                               |
| `urlParams`             | —       | Show only to visitors who landed with these query parameters, e.g. `{ "utm_campaign": "fuksit" }`. A list value accepts any of its values; matching is case-insensitive. The landing parameters are remembered for the browser session |

Editors autocomplete and validate the file through its `$schema`. `bun test` fails if an entry
would be dropped by the parser, and malformed entries are skipped at runtime rather than breaking
the banner. More examples are in [`notes/notices.md`](../notes/notices.md).

## The data stopped updating

Symptoms: the stale-data banner is showing, or `metadata.LastSynced` in
`https://alkometriikka.fi/data.json` is old.

1. Open the latest **Download Price List** run in GitHub Actions.
2. Read the **Run script to convert to JSON** step of the `sync` job:

| Log says                                              | Meaning                                         | Action                                                                                                    |
| ----------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `Search fetch was INCOMPLETE` / `returned 0 products` | Alko's search API failed or rate-limited us     | Usually transient; the next scheduled run retries. If it persists, check the API by hand (see below)      |
| `Store fetch failed`                                  | `/api/stores` failed or returned a partial list | Same                                                                                                      |
| `No existing dataset was loaded`                      | Seeding `data.json` from `gh-pages` failed      | Check `gh-pages` still has `data.json`. Never force this unless you really want to start the dataset over |
| `Safeguards rejected this sync` + a list of problems  | The API answered with data that looks wrong     | See below                                                                                                 |
| A failing test in **Run data and dataset tests**      | Code on `main` broke the data tests             | Fix the code                                                                                              |

3. While it's down, consider posting a notice with `replacesStaleWarning: true` explaining why.

### Checking the API by hand

```sh
curl -s -X POST 'https://www.alko.fi/api/search/product' \
  -H 'User-Agent: Mozilla/5.0 (X11; Linux x86_64; rv:147.0) Gecko/20100101 Firefox/147.0' \
  -H 'Content-Type: application/json' -H 'Accept: application/json' \
  -d '{"top":5,"skip":0,"seed":1337}' | jq '."@odata.count", .value[0]'
```

A 403 without the `User-Agent` header is normal. A changed response shape means the field
mapping in `scripts/data/constants.ts` needs updating.

### Safeguard rejections

The safeguards ([Sync pipeline → Safeguards](data/sync-pipeline.md#safeguards)) say which check
failed:

- **"would be emptied … has the API renamed the field?"**: Alko renamed or removed a field. Find
  the new name in a raw API response and update `FIELD_TO_LEGACY_SCHEMA`. Do not force.
- **"N/M active products would be flagged as removed"** or **"would be deleted"**: either the API
  is returning a partial or different list (don't force), or Alko genuinely changed its selection
  (force).
- **"Only N/M products list any store"**: store availability is broken in the API. Don't force.

### Forcing a sync

Only for a real, large change in Alko's selection: **Actions → Download Price List → Run
workflow**, check **force**. That sets `ALKO_SYNC_FORCE=1`, which writes the result despite the
safeguards. Read the run log afterwards to confirm the numbers look right.

## Things that need a version bump

Several caches and pins are keyed on a version constant. Change the code without bumping and you
get stale output; bump without need and you pay a full regeneration.

| Constant                  | File                                 | Bump when                                                                                                               | Cost of a bump                                                                                                                                                                                      |
| ------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `HASH_VERSION`            | `scripts/data/constants.ts`          | The set of hashed columns, a hashed column's preprocessor, or hash canonicalization changes                             | One run re-fetches details for products whose hash differs                                                                                                                                          |
| `DAILY_GAME_VERSION`      | `src/lib/daily/questions.ts`         | The Daily game for the same seed and pool changes (generator, RNG, pool/trim logic). The test suite fails if you forget | Today's game re-rolls, saved progress is lost, unarchived days are skipped. Deploy after the 00:15 archive run and update the test fixture. See [Daily game → Versioning](daily-game.md#versioning) |
| `RENDER_VERSION`          | `scripts/site/prerender-products.ts` | Product page rendering changes in a way its inputs don't capture                                                        | Every product page is regenerated once                                                                                                                                                              |
| `OG_DESIGN_VERSION` (env) | workflow env / `scripts/og/og.ts`    | You want to force a full OG re-render without changing `og.ts`                                                          | ~13 000 images re-rendered and uploaded                                                                                                                                                             |
| `DATASET_INDEX_VERSION`   | `src/lib/alko/index.ts`              | The shape of `data.json`'s `index` changes                                                                              | Browsers ignore old indexes until the next sync rewrites them                                                                                                                                       |
| `ARCHIVE_INDEX_VERSION`   | `src/lib/daily/manifest.ts`          | The shape of `daily/archive/index.json` changes                                                                         | —                                                                                                                                                                                                   |

`DAILY_LAUNCH_DATE` must never change.

## Product OG images

- **Full re-render** (after a design change): CI handles it automatically on the next sync, but
  rendering 13 000+ images there is slow. Faster: render on a PC and upload, as described in
  [`notes/og-images.md`](../notes/og-images.md#first-full-render-on-a-pc-then-batch-upload),
  then upload the resulting `og-images.json` to `gh-pages`.
- **A product shows Alko's photo instead of a card**: its render failed or it has no key in
  `og-images.json`. The next successful run retries it.
- **403 from R2**: usually the wrong jurisdiction. EU buckets need `CF_R2_REGION=eu`. Also check the
  token has Object Read & Write on the bucket.

## R2 maintenance

`bun run r2 <command>` (`scripts/r2/cli.ts`), with `CF_R2_*` from `.env`:

```sh
bun run r2 count [prefix]                     # count objects, e.g. products/
bun run r2 list [prefix] [--limit n]          # list keys
bun run r2 rm <key…>                          # delete keys
bun run r2 prune-daily --before 2026-09-30    # dry run: Daily cards before a date
bun run r2 prune-daily --before-game 10 --delete  # delete cards before day #10
```

## Daily game problems

- **Players see "Päivän peliä ei voitu ladata."**: the manifest for today is missing or doesn't
  verify. Check `https://alkometriikka.fi/daily/<date>.json` exists. If `DAILY_GAME_VERSION` was
  just bumped, wait for `fetchData.yml` to re-bake after the build. If the file is missing, run
  **Download Price List** manually.
- **A build fails with "daily/ was not restored"**: `gh-pages` lost `daily/`. Do not work around
  it with `DAILY_ALLOW_EMPTY`; that would re-roll games. Restore the folder on `gh-pages` (from git
  history, or the archive from the R2 backup `daily-archive.tar.gz`) first.
- **archiveDaily fails with "Archive shrank"**: `gh-pages` has fewer archive files than the R2
  backup. Find out which files disappeared and restore them before re-running.

## Running a pipeline step locally

Every CI step can be run against local files with `--dev` (reads/writes `static/`):

```sh
bun run sync --dev
bun run daily --dev
bun run scripts/site/rss.ts --dev
bun run sitemap --dev
bun run build    # also prerenders into build/ from static/ files copied by vite
```

To reproduce a CI run against production data, download `data.json`, `hashes.json` and
`availability.json` from the site into the repo root and run the scripts without `--dev`. Don't
set the R2 variables unless you mean to touch production.

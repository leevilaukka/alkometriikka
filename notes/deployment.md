# Deployment & data sync (GitHub Pages)

How the site and its dataset get published, why the CI sync currently refetches
everything, and the recommended way to seed `gh-pages` with the new-format
`data.json`.

## Architecture

The app is a static SvelteKit build (`@sveltejs/adapter-static`) hosted on the
`gh-pages` branch. The dataset (`data.json`) is **not** committed to `main` — it
is gitignored ([`.gitignore`](../.gitignore): `/static/data.json`) and lives only
on `gh-pages` alongside the built site. Locally it sits at
[`static/data.json`](../static/data.json).

Two workflows manage this:

### [`build.yml`](../.github/workflows/build.yml) — deploy the site (push to `main`)

1. Build the SvelteKit static site.
2. Move build output to repo root, copy `404.html` → `index.html`.
3. **Restore `data.json` and `sitemap.xml` from the existing `gh-pages`** via
   `git show origin/gh-pages:data.json > data.json`, so the deploy never clobbers
   the live dataset.
4. Write `CNAME`, then **force-push** to `gh-pages`.

### [`data.yml`](../.github/workflows/data.yml) — refresh the dataset (every 6h + after build + manual)

1. Checkout `main`.
2. Run the sync ([`scripts/setup/index.ts`](../scripts/setup/index.ts)), which
   reads `./data.json`, hashes the search API, and fetches details only for
   new/changed products.
3. Stash `data.json` + `sitemap.xml`, checkout `gh-pages`, apply, commit, push.

## The problem: CI sync refetches everything

`data.json` is gitignored, so it does **not** exist on the `main` checkout when
`data.yml` runs the sync. `loadExistingData()` finds no file → starts fresh →
**fetches details for all ~13k products on every run.**

The hash-based change detection (see [`notes/notes.md`](./notes.md) and
[`notes/improvements.md`](./improvements.md)) is wasted in CI because there is no
baseline to compare against. Pushing new data to `gh-pages` alone does **not**
fix this, because the sync never reads from `gh-pages` — it only reads the
(absent) `data.json` on `main`.

## Recommended approach (two parts)

### Part 1 — one-time: seed `gh-pages` with the new-format `data.json`

Required first, because the `data.json` currently on `gh-pages` is the **old
`{ table, metadata }` format**. The new sync's `loadExistingData()` rejects it
(no `schema` key) and starts fresh anyway, so the baseline must be replaced with
a new-format file before Part 2 helps.

Use a worktree so the working tree is left untouched (run where the repo lives):

```bash
git fetch origin gh-pages
git worktree add ../ghp gh-pages
cp static/data.json ../ghp/data.json      # locally-generated new-format dataset
cd ../ghp
git add data.json
git commit -m "Seed new-format dataset [skip ci]"
git push origin gh-pages
cd -
git worktree remove ../ghp
```

`build.yml` preserves this on the next deploy (it restores `data.json` from
`gh-pages` before force-pushing), so it will not be overwritten.

### Part 2 — permanent: make `data.yml` seed its baseline from `gh-pages`

This is the actual fix that makes the sync cheap. Add a step **before** "Run
script to convert to JSON" in [`data.yml`](../.github/workflows/data.yml):

```yaml
- name: Seed existing dataset from gh-pages
  run: |
    git fetch origin gh-pages || true
    git show origin/gh-pages:data.json > data.json 2>/dev/null || true
```

After this, each run reads the previous new-format dataset, hashes the search
API, and fetches details only for changed/new products — the intended design.

## Notes / caveats

- **Order matters:** Part 1 must land before Part 2 has any effect. Until the
  `gh-pages` `data.json` is new-format, the seeded baseline is rejected and the
  sync still starts fresh.
- **Format compatibility:** `loadExistingData()` requires the top-level
  `schema` array and per-product `{ hash, values }` entries. An old-format seed
  is silently ignored (starts fresh) rather than erroring.
- **First run after seeding** may still refetch some products if stored hashes
  differ from the sync's hash domain — see improvement #14 in
  [`notes/improvements.md`](./improvements.md) (migration hash must match the
  sync hash). After one run it stabilizes.
- **`CLOUDFLARE_PURGE_KEY` / `CLOUDFLARE_ZONE`** are only used to purge the CDN
  cache in non-dev sync runs; unrelated to the seeding, but the deployed
  `data.json` is fronted by Cloudflare, so a stale cache can hide a fresh push.

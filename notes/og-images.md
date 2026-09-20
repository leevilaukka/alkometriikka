# Prerendered OG images (satori + R2)

Per-product Open Graph images are prerendered as 1200×630 PNGs (bottle photo +
text card with the site favicon) and served from a Cloudflare R2 bucket behind a
custom domain. This keeps `og:image`/`twitter:image` off Alko's CDN and gives
every shared link a consistently branded preview.

## Architecture

- [`scripts/og/og.ts`](../scripts/og/og.ts) — shared rendering module. Builds the SVG
  with [satori](https://github.com/vercel/satori), rasterizes it with
  [@resvg/resvg-js](https://github.com/yisibl/resvg-js), and exposes the key/URL
  helpers used by both scripts below.
  - Inter static TTFs are embedded from `src/lib/assets/fonts/Inter/static/`;
    the favicon is extracted from `static/favicon.ico`.
  - The visible-on-image content (name, price, category, sale, volume, ABV) is
    hashed with SHA-256; the key is `products/{id}-{first 12 hex chars}.png`.
    The hash intentionally excludes the id, image URL, and the CDN URL, so a
    content change (e.g. a price drop) produces a new key but unrelated metadata
    does not.
  - `OG_CDN_BASE` env overrides the default `https://cdn.alkometriikka.fi`.
- [`scripts/r2/client.ts`](../scripts/r2/client.ts) — minimal AWS Signature V4 client for
  R2's **S3-compatible endpoint**
  (`https://<account>.<region>.r2.cloudflarestorage.com`, region = `CF_R2_REGION`,
  default `eu`). The Cloudflare REST API throttles to ~4 req/s account-wide (≈ 1 h
  for a full dataset); the S3 endpoint has its own much higher limits, so bulk
  uploads finish in minutes.
- [`scripts/og/og-images.ts`](../scripts/og/og-images.ts) — three modes:
  - *Render-only* (`--render <dir>`): fetch the Alko `t_medium` photo, render the
    SVG, rasterize the PNG, and write it under `<dir>/products/` plus a
    `<dir>/og-images.json` manifest. No credentials needed. Skips products whose
    previous manifest key still matches. This is how the full catalog is
    rendered locally on a PC. Pass `--local` to force files-only even when
    `CF_R2_*` is present (Bun auto-loads `.env`, so otherwise `--render` also
    uploads). The manifest is flushed every 500 products, every 15 s, and on
    `Ctrl-C`, so an interrupted run resumes from where it stopped instead of
    starting over.
  - *Upload-only* (`--upload <dir>`): push every PNG in a render dir so the
    bucket matches its manifest (via the S3 endpoint, high concurrency, no
    rate-limit throttle), then prune objects for products that left the dataset.
    Idempotent — content-addressed keys make re-uploading harmless.
  - *Render-and-upload* (no `--render`/`--upload`, credentials provided): the CI
    path. Renders only products whose display content changed, uploads them, and
    writes the manifest to `--manifest`.
  - Cleanup is derived from `data.json`: a product still present in the dataset
    always keeps its image (even if it failed or was capped by `--limit`); only
    products that have left the dataset are pruned. All deletion is skipped when
    the pass had any failure, so a partial run never wipes valid images.
- [`scripts/site/prerender-products.ts`](../scripts/site/prerender-products.ts) — reads the
  manifest (`--og-manifest`, default `build/og-images.json`), and for each
  product sets `og:image`, `twitter:image`, and `og:image:width/height` to the
  R2 URL when a key exists, falling back to the Alko CDN URL otherwise.

## One-time setup

1. **Bucket** (default name `alkometriikka-og`) and **custom domain**
   (`cdn.alkometriikka.fi`) via wrangler or the dashboard:

   ```bash
   bunx wrangler r2 bucket create alkometriikka-og
   bunx wrangler r2 bucket domain add alkometriikka-og cdn.alkometriikka.fi
   ```

2. **R2 API token** — Dashboard → R2 → *Manage R2 API Tokens*. Copy the
   **Access Key ID** and **Secret Access Key**; they authenticate against the
   S3 endpoint. The bucket must be selected (or created with account-level
   access). Also usable: `bunx wrangler r2 object put` style uploads, but the
   script uses the S3 API directly.

   If `list`/`put` return a 403 `AccessDenied` with the shape of a valid token,
   the usual culprits (in order): **wrong endpoint jurisdiction** (buckets with
   an EU data location must use `https://<account>.eu.r2.cloudflarestorage.com`;
   the legacy global `*.r2.cloudflarestorage.com` endpoint 403s for them — set
   `CF_R2_REGION=eu`, see below), the token was created without the R2
   "Object Read & Write" permission, the bucket doesn't exist yet, or the token
   doesn't cover `alkometriikka-og` / the `CF_R2_ACCOUNT_ID` account. Test with:

   ```bash
   bun run scripts/og/og-images.ts --upload <render-dir> --data static/data.json
   ```

## CI wiring

- `.github/workflows/fetchData.yml` runs the *render-and-upload* mode every 6h
  right before prerendering product pages. Only changed products are
  re-rendered/re-uploaded (usually a handful), so the step is quick.
  `continue-on-error: true` — if OG generation fails, pages deploy with the
  previous manifest (Alko-CDN fallback).
- `.github/workflows/build.yml` seeds `static/og-images.json` from `gh-pages` so
  `vite build` copies it into `build/og-images.json` for the prerender step.

## Required secrets & vars

- `CF_R2_ACCESS_KEY_ID` (secret) — R2 API token access key.
- `CF_R2_SECRET_ACCESS_KEY` (secret) — R2 API token secret.
- `CF_R2_ACCOUNT_ID` (secret) — Cloudflare account id (used for the endpoint
  host). Copy from the R2 overview page or `whoami`.
- `CF_R2_REGION` (var, default `eu`) — R2 jurisdiction subdomain for the S3
  endpoint (`https://<account>.<region>.r2.cloudflarestorage.com`). Must match
  the bucket's data location; non-EU accounts use e.g. `us`.
- `CF_R2_BUCKET` (repository variable, optional) — defaults to
  `alkometriikka-og`.
- `OG_CDN_BASE` (repository variable, optional) — defaults to
  `https://cdn.alkometriikka.fi`.

Local copies go in `.env` (see `.env.example`).

## First full render on a PC, then batch upload

Rendering (fetch 13.5k photos + rasterize) is CPU/network-bound and makes no API
calls to Cloudflare, so do the bulk locally once; the CI only handles the
incremental syncs afterwards.

```bash
# 1) Render the entire catalog (~30-40 min; no credentials needed).
#    --local keeps it files-only even if CF_R2_* is loaded from .env.
#    Safe to Ctrl-C and re-run: it resumes from the written manifest.
bun run scripts/og/og-images.ts --render /tmp/og-rendered --local --data static/data.json

# 2) Batch-upload the rendered dir via the R2 S3 endpoint (~10-15 min)
export CF_R2_ACCESS_KEY_ID=... CF_R2_SECRET_ACCESS_KEY=... CF_R2_ACCOUNT_ID=...
bun run scripts/og/og-images.ts --upload /tmp/og-rendered --data static/data.json

# 3) Commit the manifest on gh-pages (via the web UI, no script needed)

   In GitHub, switch the repo to the `gh-pages` branch → **Add file → Upload
   files** → drop `og-images.json` in → commit. One commit, no branch juggling.
   `fetchData.yml` picks it up on its next run as the resume baseline; re-run
   web-uploads whenever a later local render+upload refreshes the manifest.
#    (after push, roll back with the old-sha command the script prints)
```

## Local run

```bash
# Render just a handful locally to preview (--local avoids R2 even with .env)
bun run scripts/og/og-images.ts --render /tmp/og-preview --local --limit 5 --data static/data.json

# Render changed products + upload them (CI mode)
# needs CF_R2_* env vars
bun run scripts/og/og-images.ts --data static/data.json --manifest og-images.json

# Full build with R2 URLs baked into the product pages
bun run scripts/site/prerender-products.ts --data static/data.json --out build --template src/app.html --og-manifest og-images.json
```

## Notes / caveats

- Storage stays bounded ≈ (#products × ~0.2–0.3 MB ≈ ~4 GB): each product owns
  exactly one content-addressed object, and old versions are pruned on the next
  successful run. Only a run that ends with per-product failures skips pruning
  (safety), and the next clean run sweeps the orphans away.
- Products with a failed bottle fetch are skipped and fall back to the Alko CDN
  URL in prerendered pages.
- The hash covers the **displayed product content** (name, price, sale, specs…)
  **plus the design fingerprint** (`ogDesignFingerprint()` in `scripts/og/og.ts`):
  the normalized (comment/whitespace-stripped) source of `scripts/og/og.ts`, the embedded
  favicon, and the fonts. Consequences:
  - A real layout change (edit `og.ts`, new favicon/fonts) changes every key, so
    the next run re-renders and re-uploads the whole catalog automatically —
    this happens in CI, or run the PC first-batch flow for speed.
  - Formatting-only edits (prettier, reordering, comments, renaming that leaves
    visual output identical) do not change the fingerprint, so no re-render.
  - `OG_DESIGN_VERSION` (env, default `1`) is mixed into the fingerprint as an
    escape hatch: bump it in CI to force a one-off global refresh without a
    code change.
- Objects are uploaded with
  `Cache-Control: public, max-age=31536000, immutable` (+ `CDN-Cache-Control`
  of the same value) since keys are content-addressed. Consequently each
  distinct image is fetched from the R2 bucket once per edge PoP at most —
  repeat visitors are served from their browser / the Cloudflare cache,
  keeping R2 read operations (and bandwidth) minimal.
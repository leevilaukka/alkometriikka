# Site generation

Everything the pipeline generates besides the dataset: prerendered page stubs, feeds, the sitemap
and the Open Graph images. All of it is derived from `data.json` and `availability.json`, and none
of it is committed to `main`.

## Prerendered stubs

The site is a client-rendered SPA, so crawlers and link-preview bots that don't run JavaScript
would see the same generic `404.html` for every URL. The prerender scripts write a real
`<path>/index.html` for every indexable page. Each stub is the built `404.html` (so it boots the
full app) with:

- the content between the `<!-- Dynamic SEO data start/end -->` markers in `src/app.html`
  replaced by page-specific description, keywords, canonical link, Open Graph and Twitter tags,
  JSON-LD, and alternate links such as RSS feeds;
- the page's `<title>`;
- a plain-HTML fallback `<article>` at the top of `<body>` with the key content and links, which
  an inline script removes as soon as a browser runs it;
- `modulepreload` links for the page route's own code (its node, layouts, error page and their
  chunks) that the shell doesn't already preload.

The shell only preloads the root layout's code, so without the route preloads the browser finds a
page's chunks only once the app has started, by which time they share the connection with the
`data.json` and `availability.json` downloads. `scripts/site/route-preloads.ts` reads each route's
files from SvelteKit's build output (`.svelte-kit/output/server`) right after `vite build` and
writes them to `route-preloads.json` next to the site. The file is deployed, because the fetch-data
workflow re-renders product pages against the deployed `404.html` without a build. When it's
missing, stubs preload only the shell's code.

The shared renderer is `renderStub()` in `scripts/lib/stub.ts`; HTML/JSON escaping, the marker
replacement and a small minifier are in `scripts/lib/html.ts`. Page copy (descriptions, titles)
comes from `src/lib/utils/app/seo.ts` and `categories.ts`, the same functions the client uses for
`setSEO()`.

### Product pages

`scripts/site/prerender-products.ts --data <data.json> --out <dir> --template <404.html>
[--og-manifest <file>] [--og-categories-manifest <file>] [--manifest <file>]` (the three manifests
default to `og-images.json`, `og-categories.json` and `tuotteet-manifest.json` in `<dir>/data/`)

Writes `tuotteet/<id>/index.html` for every product, including removed ones, with `Product`
JSON-LD (offer with price and availability, additional properties, sale price when on sale,
unit pricing as the bottle's price and volume so Google derives the litre price itself),
`BreadcrumbList` JSON-LD for its category trail, an RSS alternate when the product has a price
history feed, and `product:*` meta tags (price, brand, availability, condition, item id). The OG
image is the product's R2 card if `og-images.json` has a key for it, else Alko's photo.

Products in the selection that the app's "Pakkauskoko" picker shows as sizes of each other
(`ProductVariantIndex`) also get an `isVariantOf` `ProductGroup` and `inProductGroupWithID`, plus a
"Muut koot" list linking the other sizes in the fallback HTML. `sizeVariantGroups`
(`product-insights.ts`) merges the matches transitively, so every page of a group carries the same
group: its id is the smallest member id, its name the shortest member name, and it `variesBy` size,
and material (`Pakkaustyyppi`, also set as the product's `material`) when the members' packaging
differs. Removed products are left out, as the picker leaves them out.

The product photo, the page's LCP element, is preloaded from `<head>` with `fetchpriority="high"`.
The preload, the fallback `<img>` and the app's `ProductImage` all request it the same way (CORS,
no referrer), so the browser downloads it once and the app reuses it from cache. The photo is AVIF
(`displayImageUrl`), so the preload carries `type="image/avif"` and the fallback is a `<picture>`
with a JPEG/WebP `<img>`: browsers without AVIF skip the preload, and `ProductImage` falls back to
the same JPEG/WebP URL. The OG image and JSON-LD use the JPEG/WebP URL (`generateImageUrl`), since
link-preview crawlers may not read AVIF.

Alko's image CDN serves only a fixed set of transform and format combinations (anything else is a
404, an unknown transform a 400), and its `f_auto` never chooses AVIF, so `displayImageUrl` names
the format by the file extension:

| `ImageTransform` | URL                        | Size            | Used by                        |
| ---------------- | -------------------------- | --------------- | ------------------------------ |
| `products`       | `t_products/…/kuva.webp`   | 160×192, padded | Lists, compare, search         |
| `small`          | `t_digipruuvi/…/kuva.webp` | 500 px tall     | Daily cards                    |
| `medium`         | `t_pdp/…/kuva.avif`        | 600 px wide     | Product page, similar products |
| `large`          | `t_large/…/kuva.avif`      | 900 px wide     | Product page image zoom        |

Others that exist: `t_thumbnail` (40×48), `t_img_160x192` and
`t_img_40x148` (cropped to the bottle), and fill-cropped label close-ups like `t_4x5_w_400_h500`.

Each product stub also carries the product itself as a one-product `data.json` (schema plus that
product, about 1 KB) in `<script type="application/json" id="stub-data">`. The page renders it
before the full price list has loaded; see
[Product page preview](frontend/app-structure.md#product-page-preview).

It is **incremental**. Each page has a content key, a SHA-256 of everything that can change its
HTML: `RENDER_VERSION`, the schema, the product's values, meta and price history, the template
(new JS/CSS hashes change every page) and the product route's preloads, its OG image key, category trail, category rank and size variant group, and today's date if
the product has campaign dates (sale state depends on the date). Keys are stored in
`data/tuotteet-manifest.json`; a product whose key and file are unchanged is skipped. Directories for
products no longer in the dataset are deleted.

Bump **`RENDER_VERSION`** when you change the rendering logic in a way the inputs above don't
capture.

The same script then fully regenerates the **category pages**: `kategoriat/index.html` and one per
category in the tree, with `CollectionPage` and `ItemList` JSON-LD, up to 100 products in the
fallback list, category RSS alternates and the category OG card from `og-categories.json`.

### Static and store pages

`scripts/site/prerender-static.ts --out <dir> --template <404.html> --availability <availability.json>`

Writes the front page stub (`index.html`, from `HOME_PAGE`), stubs for the routes in
`STATIC_PAGES` (`/laskin/`, `/tilastot/`, `/myymalat/`, `/kompassi/`, `/hinnanmuutokset/`,
`/listat/`, `/seuratut/`) and one `myymalat/<id>/index.html` per store with `LiquorStore`
JSON-LD: address, coordinates, weekly opening hours, upcoming exception days
(`specialOpeningHoursSpecification`, also listed in the fallback HTML), `sameAs` to the store's
page on alko.fi, a Google Maps `hasMap` link and an accessibility `amenityFeature`. With
availability data, `/myymalat/` becomes a `CollectionPage` with an `ItemList` of every store and
fallback links to them grouped by city, the only links crawlers get to store pages besides the
sitemap. Output is deterministic: opening hours use the regular weekly pattern, not Alko's
rolling two-week calendar, plus only the exception days still ahead, so a store's file changes
only when its hours or exceptions do and unchanged stores don't add commits to `gh-pages`. Fully
regenerated on every run.

The front page stub matters for more than its tags: every filtered view (`/?Tyyppi=…`, linked from
product, category and store pages) is served the same file, so its canonical link folds them all
into `/`. Without it Google picks a filtered URL as the front page's canonical.

### Daily page

`scripts/site/prerender-daily.ts` writes `daily/index.html` with that day's OG card. See
[Daily game → Share card and stub](daily-game.md#share-card-and-stub).

## Feeds

`bun run scripts/site/rss.ts` (reads `./data.json` and `./og-images.json`, or `static/` with `--dev`)

| Output                                                             | Contents                                                 | Limit      |
| ------------------------------------------------------------------ | -------------------------------------------------------- | ---------- |
| `rss.xml`                                                          | New products and price changes across the catalog        | 1000 items |
| `feed.json`                                                        | The same items as [JSON Feed](https://www.jsonfeed.org/) | 1000 items |
| `rss/<id>.xml`                                                     | One product's price changes                              | 20 items   |
| `rss/kategoriat/<type>.xml`, `rss/kategoriat/<type>/<subtype>.xml` | A category's new products and price changes              | 50 items   |

Items come from two sources:

- **Price changes**: one item per pair of consecutive price-history points with different
  prices, dated at the newer point, with the old and new price and the change in € and %.
- **New products**: one item per product whose `Uutuus` is set, dated at its first price-history
  point (roughly when it entered the selection).

The aggregate feeds reserve a slot for every current new product before filling up with the most
recent price changes, so a busy week of price changes can't push new products out. A product gets
a per-product feed only once its price has changed at least once; stale per-product feeds are
deleted. Item images use the product's R2 card when available. `lastBuildDate` is
`metadata.LastUpdated`.

The site links the aggregate feeds from the settings dialog and price changes page, product pages
link their own feed, and category pages theirs.

## Sitemap

`bun run sitemap` (`scripts/site/sitemap.ts`) writes `sitemap.xml` with:

- every product page (`lastmod` = latest price-history date, with an `image:image` entry for the
  Alko photo);
- the category index and every category page (`lastmod` = newest price-history date among its
  active products);
- every store page;
- the fixed pages: `/`, `/daily/`, `/daily/arkisto/`, `/listat/`, `/tilastot/`, `/laskin/`,
  `/myymalat/` and so on.

`static/robots.txt` allows everything and points at the sitemap.

## Open Graph images

Share images are 1200×630 PNGs rendered with [satori](https://github.com/vercel/satori) (JSX-like
element tree → SVG) and [resvg](https://github.com/yisibl/resvg-js) (SVG → PNG), using the Inter
fonts and favicon from the repo. They are uploaded to the R2 bucket and served from
`https://cdn.alkometriikka.fi/<key>`.

| Kind     | Script                        | Key                          | Manifest                          |
| -------- | ----------------------------- | ---------------------------- | --------------------------------- |
| Product  | `scripts/og/og-images.ts`     | `products/<id>-<12 hex>.png` | `og-images.json` (id → key)       |
| Category | `scripts/og/og-categories.ts` | `categories/…-<hash>.png`    | `og-categories.json` (path → key) |
| Daily    | `scripts/og/og-daily.ts`      | `daily/<date>.png`           | none (one per day, overwritten)   |

### Product cards

`scripts/og/og.ts` holds the design: bottle photo (Alko's `t_medium` image, or a monogram
placeholder from `og-placeholder.ts` when Alko has none) and a text panel with name, price, sale
price, category, volume and ABV.

Keys are **content-addressed**. The hash covers the displayed fields plus a design fingerprint:
the comment- and whitespace-stripped source of `og.ts`, the favicon, the fonts and
`OG_DESIGN_VERSION`. Consequences:

- A price change re-keys that product only, so CI renders a handful of images per run.
- A real design change re-keys every product, so the next run re-renders the whole catalog.
  Formatting-only edits to `og.ts` don't.
- Setting `OG_DESIGN_VERSION` to a new value forces a full re-render without a code change.

`og-images.ts` has three modes:

```sh
# Render only, no credentials (resumable; --local ignores CF_R2_* from .env)
bun run scripts/og/og-images.ts --render /tmp/og --local --data static/data.json [--limit 5]

# Upload a render directory, then prune keys for products no longer in the dataset
bun run scripts/og/og-images.ts --upload /tmp/og --data static/data.json

# CI: render products whose key changed, upload them, write the manifest
bun run scripts/og/og-images.ts --data data.json --manifest og-images.json
```

Products still in the dataset always keep their image, even if rendering them failed this run.
Pruning is skipped entirely when any product failed, so a partial run never deletes valid
images.

### Category cards

`og-categories.ts` renders one card per category page with its product count and median numbers
(`og-category-card.ts`). It has its own key prefix, manifest and design fingerprint, so it can
never re-key or prune product images. There are about a hundred and no network fetches, so even a
full re-render is quick.

### Caching

Objects are immutable by key, so a Cloudflare Cache Rule on `cdn.alkometriikka.fi` sets
`Cache-Control: public, max-age=31536000, immutable`. Bun's S3 client can't set per-object
headers, which is why it's done at the edge.

More background and the one-time bucket setup are in [`notes/og-images.md`](../notes/og-images.md).

## R2

`scripts/r2/client.ts` wraps Bun's built-in `S3Client` for R2's S3-compatible endpoint
(`https://<account>.<region>.r2.cloudflarestorage.com`). The S3 endpoint is used instead of the
Cloudflare REST API because the REST API is throttled to about 4 requests per second, which made a
full catalog upload take an hour.

The bucket (`alkometriikka-og` by default) holds:

| Prefix / key           | Written by          |
| ---------------------- | ------------------- |
| `products/`            | `og-images.ts`      |
| `categories/`          | `og-categories.ts`  |
| `daily/<date>.png`     | `og-daily.ts`       |
| `daily-archive.tar.gz` | `backup-archive.ts` |

For ad hoc maintenance use the R2 CLI, described in
[Operations → R2 maintenance](operations.md#r2-maintenance).

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
  an inline script removes as soon as a browser runs it.

The shared renderer is `renderStub()` in `scripts/lib/stub.ts`; HTML/JSON escaping, the marker
replacement and a small minifier are in `scripts/lib/html.ts`. Page copy (descriptions, titles)
comes from `src/lib/utils/seo.ts` and `categories.ts`, the same functions the client uses for
`setSEO()`.

### Product pages

`scripts/site/prerender-products.ts --data <data.json> --out <dir> --template <404.html>
--og-manifest <og-images.json> [--og-categories-manifest <file>] [--manifest <file>]`

Writes `tuotteet/<id>/index.html` for every product, including removed ones, with `Product`
JSON-LD (offer with price and availability, additional properties, sale price when on sale),
`BreadcrumbList` JSON-LD for its category trail, an RSS alternate when the product has a price
history feed, and `product:price:*` meta tags. The OG image is the product's R2 card if
`og-images.json` has a key for it, else Alko's photo.

It is **incremental**. Each page has a content key, a SHA-256 of everything that can change its
HTML: `RENDER_VERSION`, the schema, the product's values, meta and price history, the template
(new JS/CSS hashes change every page), its OG image key and category trail, and today's date if
the product has campaign dates (sale state depends on the date). Keys are stored in
`tuotteet-manifest.json`; a product whose key and file are unchanged is skipped. Directories for
products no longer in the dataset are deleted.

Bump **`RENDER_VERSION`** when you change the rendering logic in a way the inputs above don't
capture.

The same script then fully regenerates the **category pages**: `kategoriat/index.html` and one per
category in the tree, with `CollectionPage` and `ItemList` JSON-LD, up to 100 products in the
fallback list, category RSS alternates and the category OG card from `og-categories.json`.

### Static and store pages

`scripts/site/prerender-static.ts --out <dir> --template <404.html> --availability <availability.json>`

Writes stubs for the routes in `STATIC_PAGES` (`/laskin/`, `/tilastot/`, `/myymalat/`,
`/kompassi/`, `/hinnanmuutokset/`) and one `myymalat/<id>/index.html` per store with `LiquorStore`
JSON-LD (address, coordinates, weekly opening hours). Output is deterministic: opening hours use
the regular weekly pattern, not Alko's rolling two-week calendar, so unchanged stores produce
byte-identical files and don't add commits to `gh-pages`. Fully regenerated on every run.

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

# Alkometriikka

**Alkometriikka is an independently maintained, continuously updated database and web application built around the Finnish Alko product catalog.**

_Alkometriikka on itsenäisesti ylläpidetty ja jatkuvasti päivittyvä tietokanta ja verkkosovellus, joka kokoaa yhteen tietoa Alkon tuotteista, hinnoista, saatavuudesta ja tuotehistoriasta._

[alkometriikka.fi](https://alkometriikka.fi/)

Alkometriikka started as a simple way to compare the price and amount of alcohol in different products. It has since grown into a broader data platform containing product information, price history, statistics, store availability, machine-readable feeds, automatically generated product pages, and interactive features.

## Features

* **Product database** — Browse and search the Alko catalog.
* **Advanced filtering** — Find products by category, price, alcohol content, size, producer, and other properties.
* **Product statistics** — Compare prices, alcohol content, value, and other calculated metrics.
* **Price history** — Track how product prices have changed over time.
* **Store availability** — See which Alko stores currently carry a product.
* **Shareable lists** — Create and share product selections.
* **Alkometriikka Daily** — A daily game generated from the product database.
* **Product pages** — Individual, search-engine-friendly pages for products in the catalog.
* **RSS feeds** — Follow catalog and product changes without visiting the site.
* **Machine-readable data** — The underlying datasets are published for use by the website and other applications.
* **Automated updates** — Product data and derived content are continuously processed through GitHub Actions.

## Architecture

The product dataset is the foundation of Alkometriikka. Automated data processing produces the data consumed by the website, generated product pages, feeds, and interactive features.

```mermaid
flowchart TD
    A[Alko product data] --> B[Data ingestion]
    B --> C[Normalized product data]

    P[GitHub Actions] --> B
    P --> D[Website]
    P --> E[Product pages]
    P --> F[Data feeds]
    P --> I[Daily]

    C --> D
    C --> E
    C --> F
    C --> G[Price history]
    C --> H[Store availability]
    C --> I[Daily]

    D --> J[Search & filtering]
    D --> K[Shareable lists]

    F --> L[RSS]
    F --> M[JSON]
    F --> N[External integrations]
```

### Deployment

The production site is primarily served as a static site. GitHub Actions builds the application and generated content and publishes the resulting site to GitHub Pages. Open Graph images are generated separately and stored in a Cloudflare R2 bucket.

```mermaid
flowchart LR
    A[Source code] --> B[GitHub Actions]
    C[Product data] --> B

    B --> D[Svelte build]
    B --> E[SEO / OG stubs]
    B --> F[RSS / feeds]
    B --> G[Daily archive]
    B --> H[OG image generation]

    D --> I[GitHub Pages]
    E --> I
    F --> I
    G --> I
    H --> J[Cloudflare R2]
```

## Tech stack

* [Svelte](https://svelte.dev/)
* [SvelteKit](https://kit.svelte.dev/)
* [TypeScript](https://www.typescriptlang.org/)
* [Bun](https://bun.sh/)
* [Vite](https://vite.dev/)
* GitHub Actions
* GitHub Pages
* Cloudflare

## Development

Install dependencies:

```sh
bun install
```

Start the development server:

```sh
bun run dev
```

For development without running the data synchronization step:

```sh
bun run dev:no-sync
```

Build the application:

```sh
bun run build
```

Run type checking and Svelte diagnostics:

```sh
bun run check
```

Format the code:

```sh
bun run format
```

Check formatting:

```sh
bun run lint
```

### Testing product size matching

Run `npm test` with Node.js 24 or newer. The tests run TypeScript directly and
need no additional test dependencies or network access.

Size variants use conservative name normalization and catalogue metadata. A
restricted Finnish lager fallback handles class suffixes only when the producer,
strength, measurements, and tasting descriptors agree. There are no product-ID
or brand-specific mappings. Missing/estimated sizes cannot establish a match.

## Data and generated content

The repository contains scripts for maintaining the product dataset and generating derived content.

### Data

```sh
bun run sync
bun run migrate
```

`sync` handles the product data pipeline, while `migrate` is used for data migrations between schema versions.

### Viinilehti wine reviews

Product pages load optional, locally hosted `reviews/<Alko SKU>.json` files with
Viinilehti's full review, stars, food pairing, review date, and source link. An
exact vintage match is preferred; when the available review covers another
vintage, the page labels the difference. Review text is rendered as plain text.
If a search link redirects to a different vintage of the same SKU, the importer
stores the page's actual vintage and keeps the index ID as an alias for cache
refreshes. Pages for another SKU are rejected.

Populate the local development cache after obtaining `static/data.json`:

```sh
bun run sync:reviews --dev
bun run dev:no-sync
```

For a quick manual check of specific products:

```sh
bun run sync:reviews --dev --sku 431777 --sku 590857
```

The sync script also runs directly with Node.js 24+: `node scripts/data/reviews.ts --dev`.
Open `/tuotteet/431777/` or `/tuotteet/590857/` after syncing to inspect the review.

The **Arvostelut** page at `/arvostelut/viinit/` lists all collected reviews,
including historical vintages, with full text, search, rating filters, sorting,
pagination, and product links. It is linked from the navigation menu.
Every review sync also generates `reviews/skus.json` (a sorted JSON array of
six-digit SKU strings with collected reviews) and `reviews/all.json` (the full
collection loaded by the review page in one request). These files describe the
collected cache. To rebuild them from existing files without network requests:

```sh
bun run sync:reviews --dev --catalog-only
```

To collect all indexed reviews for the whole catalog, including products removed
from sale:

```sh
bun run sync:reviews --dev --limit 0 --include-removed --concurrency 4
```

The sync fetches Viinilehti's public search index at most once a day, matches
Alko SKUs, and extracts the structured review JSON from matched pages. By default
it selects active products; `--include-removed` includes the archived catalog too.
It fetches up to 200 pages per run, spaced 500 ms apart. Missing reviews are
filled first; cached text is refreshed after 30 days or a changed slug/rating.
`--concurrency 1` (default) through `4` controls pages in flight while preserving
the gap between request starts and serial cache writes.
Successive runs continue filling the cache. `--limit 0` removes the page budget,
`--force` refreshes the index and selected reviews, and `--data` / `--out` override
the catalog and cache paths. Failed pages are retried after a day. A rate-limit
or access-denied response pauses the batch immediately; three consecutive network/server failures
also pause it. Missing or changed individual pages are skipped. The index and
review lists are saved every 50 attempts, so interrupted runs retain their
progress. Old reviews, including previously collected vintages, are retained on
source failures. Products without a matching source review remain without one.

Development HTML omits the analytics scripts in `src/app.html` via the
`analytics:start` / `analytics:end` markers and the server hook. Use `vite dev`
(or `dev:no-sync`) for phone tunnels. Generated review JSON and build output
are excluded from the dev file watcher; reload the page to pick up new reviews.

The six-hour data workflow seeds, updates, and publishes this cache for active
and archived products separately
from Alko's dataset. Review sync errors do not block the product-data update.
Site builds preserve the deployed review cache. Generated files are ignored by
Git on feature branches. These source interfaces are undocumented; extraction
failures leave cached reviews intact. Browsers only request our static files.

### Site generation

```sh
bun run sitemap
bun run og:images
```

These generate supporting content for the production site, including the sitemap and Open Graph images.

### Daily

```sh
bun run daily
bun run backup:daily
```

The Daily game is generated from the product dataset. Historical games are preserved so that previously published Daily questions remain immutable.

## Using Alkometriikka data

Alkometriikka's machine-readable data is provided so that others may build useful projects and integrations around it.

Please **do not hammer the site or its data endpoints with requests**.

If you are building an application that consumes Alkometriikka data:

* Cache responses locally whenever possible.
* Do not repeatedly request the same data when it has not changed.
* Prefer the published feeds and machine-readable datasets over scraping individual pages.
* Avoid aggressive polling and unnecessary concurrent requests.
* Use a sensible refresh interval appropriate for your application.
* Respect HTTP caching headers where provided.
* If you need a large amount of data, download it once and process it locally rather than repeatedly requesting individual resources.
* Do not build systems that continuously crawl the entire site or product catalog.

Alkometriikka is an independently maintained project with limited infrastructure. **Reasonable use helps keep the service available for everyone.**

If your application has an unusual or particularly heavy data requirement, consider getting in touch before deploying it.

## Feeds and integrations

Alkometriikka provides machine-readable interfaces intended to make the data useful outside the main website.

These can be used for applications such as:

* RSS readers
* Discord bots
* Automated notifications
* Data analysis
* Personal projects
* Other integrations built around Alkometriikka's data

The feed infrastructure also allows changes detected by the automated data pipeline to be consumed by external applications without requiring them to continuously poll the website.

When building an integration, **please use the feeds and published datasets where possible, cache the data, and avoid unnecessary requests**.

## Static generation

The product routes are pre-generated primarily to provide search engines and link previews with useful metadata.

The generated product HTML is intentionally lightweight and acts largely as a stub containing SEO metadata, structured data, Open Graph information, and the basic page shell. The actual application functionality and product data are handled by the client-side application and published data files.

This approach provides:

* Search-engine-friendly product URLs
* Useful Open Graph previews when links are shared
* Structured data for search engines
* Fast initial page responses
* A static deployment without requiring a traditional application server

The generated files should therefore not be considered a separate product database or a complete server-rendered version of the application. They are primarily an SEO and metadata layer around the underlying Alkometriikka application and data.

## Privacy

Alkometriikka uses privacy-focused analytics to understand how the site is used.

No account is required to use the site, and the application does not require personal information for its core functionality.

## Disclaimer

Alkometriikka is an independent project and is **not affiliated with Alko**.

Product information, prices, availability, and other data may change and may not always reflect the current situation at an individual Alko store. Store availability in particular may be delayed depending on the project's data collection schedule.

Alkometriikka does not sell alcohol or facilitate alcohol purchases.

Alcohol consumption carries health risks. Please drink responsibly.

## Huomautus

Alkometriikka on itsenäinen projekti, eikä se ole Alkon ylläpitämä tai Alkon kanssa millään tavalla yhteistyössä toteutettu palvelu.

Tuotetiedot, hinnat, saatavuustiedot ja muut tiedot voivat muuttua, eivätkä ne välttämättä aina vastaa Alkon ajantasaista tilannetta tai yksittäisen myymälän todellista saatavuutta. Erityisesti myymälöiden saatavuustiedot voivat olla viivästyneitä tietojen keräysaikataulun vuoksi.

Alkometriikka ei myy alkoholia eikä suoraan mahdollista alkoholin ostamista.

Alkoholin käyttöön liittyy terveysriskejä. Käytä alkoholia vastuullisesti.

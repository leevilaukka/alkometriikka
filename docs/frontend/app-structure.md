# App structure

The app is SvelteKit 2 with Svelte 5, built with `@sveltejs/adapter-static` into a client-only
SPA. TypeScript throughout, Tailwind v4 for styling.

## Build configuration

- **`svelte.config.js`**: static adapter writing to `build/` with `fallback: '404.html'`.
  `paths.base` comes from `BASE_PATH` (empty in dev). `version.name` is the short git commit
  hash, shown in the settings dialog and sent with site feedback. `serviceWorker.files` limits
  which `static/` files the service worker precaches, and registration is off in dev.
- **`vite.config.ts`**: Tailwind and SvelteKit plugins. Production builds drop all `console.*`
  calls.
- **`src/app.html`**: the page shell. It holds the default SEO tags between
  `<!-- Dynamic SEO data start -->` and `<!-- Dynamic SEO data end -->` markers (the prerender
  scripts replace that section), site-level JSON-LD, the analytics tags, and the animated bottle
  loader that shows until the dataset has loaded.

## Loading the data

Every route sits under `src/routes/+layout.ts`, which sets `ssr = false`, `prerender = false` and
`trailingSlash = 'always'`, and returns two promises:

```ts
return { alko, alkoWithStores };
```

`trailingSlash = 'always'` is there for the [prerendered stubs](../site-generation.md#prerendered-stubs):
each is a `<path>/index.html` that GitHub Pages serves at `<path>/` (and 301s `<path>` to), with a
canonical link to that URL. With the default `'never'` the router would rewrite the address bar to
`<path>` on load, so the visible URL would redirect when shared and disagree with the canonical.

- **`alko`** resolves once `data.json` is downloaded, parsed (`parseDataset`) and indexed into a
  `Kaljakori`. It also carries the dataset's `metadata` (as `dataset.metadata`) and a lazily
  filled `availability`. The parsed table isn't kept: once the products are built from it, it
  would only take memory (category pages match products with `Kaljakori.categoryOf` instead).
- **`alkoWithStores`** resolves to the same object, but only after `availability.json` has also
  been applied.
- **`alkoWithRemoved`** resolves once the products removed from the selection have been added
  from `data-removed.json` (or failed to load). It is fetched once `data.json` is in and added in
  a `requestIdleCallback` with `Kaljakori.addProducts`. Pages showing saved products, which may
  be removed ones, wait for it: `/seuratut`, `/listat`, `/vertailu`, `/tilastot`, and `/` when the
  URL shows removed products. `/tuotteet/[id]` and `/vastaavat/[id]` await `alko.removedReady`
  only when the product isn't in the selection; a product page with a preview shows it meanwhile.

`availability.json` is requested in parallel with `data.json` but parsed only after the first
render, in a `requestIdleCallback` (`LazyAvailability` in `src/lib/alko/availability.svelte.ts`).
Its `current` and `loaded` fields are `$state`, so templates that read them update when it
arrives, and `Kaljakori.setAvailability` fills the store column in place. Pages that can't render
without store data await `alkoWithStores`:

| Route                                                | Waits for store data when…                  |
| ---------------------------------------------------- | ------------------------------------------- |
| `/` (main list)                                      | the URL has a `Myymälät` filter             |
| `/myymalat/[storeID]`                                | always                                      |
| `/kategoriat/[type]/[[subtype]]`, `/hinnanmuutokset` | "only my store" is on and a store is chosen |
| `/seuratut`                                          | always (compares stock)                     |
| `/kompassi`                                          | the store list is read from it              |

If `data.json` fails to load, the layout shows the error with a retry button, or, when a
[product page preview](#product-page-preview) is already showing, keeps it and shows a warning
banner with a retry button. If `availability.json` fails, the app continues with empty store data
and `availabilityFailed` set, so pages can say it failed instead of showing products in no store.

`+layout.svelte` waits for `data.alko`, removes the loader, and renders the header, the
[notice banner](features.md#site-notices), the page, the compare bar and the page's mobile bottom
bar. Once shown, the app stays up, so a page navigated to before the price list has loaded waits
for it itself.

### Product page preview

Most visitors land on a product page from search, so the product page doesn't wait for either file.
Each product's [prerendered stub](../site-generation.md#product-pages) embeds that product as a
one-product `data.json` in `<script type="application/json" id="stub-data">` (`STUB_DATA_ID`).
The page's `load` reads it into a one-product `Kaljakori` and returns it as `preview`, without
awaiting `data.alko`; the layout renders right away for a page whose data has a `preview`.

The page then fills in as data arrives, in place, without remounting:

1. **Stub only:** name, price, picture, details, quick stats and price history. The price-quality
   and similar-products sections, and the store parts, show placeholders sized like the loaded
   sections so the page doesn't jump.
2. **`data.json`:** the price list replaces the preview (`catalogState`). Price-quality, similar
   products, sizes and the category links in the breadcrumb appear.
3. **`availability.json`:** store availability, the preferred store's stock and the watch button
   (`availabilityState`), which waits for stock data to snapshot and compare.

If `data.json` fails, the preview stays: price-quality and similar products are left out and the
store parts say availability couldn't be loaded, as they do when only `availability.json` fails.
The watch button works either way, since a snapshot without stock data keeps the stock last seen.

While a preview is showing, `data.json` is requested at low fetch priority (as `availability.json`
always is), so on a slow connection the page's own code and photo download first. Once it arrives,
the layout yields to the browser after parsing it and again after building the `Kaljakori`, so the
work runs as several shorter tasks instead of one that blocks input for seconds on a phone.

Without a matching stub (client-side navigation, or a stub older than this) the page's `load`
awaits `data.alko` and checks the product exists, as other pages do. Store availability still
fills in after the first render.

## Offline support

`src/service-worker.ts` makes the app work offline after one online visit. It only handles
same-origin GET requests:

| Request                                                          | Strategy                                 |
| ---------------------------------------------------------------- | ---------------------------------------- |
| Page navigations                                                 | Network, with a timeout; see below       |
| `_app/immutable/*` and the precached icons                       | Cache first (refreshed with each deploy) |
| Other `.json` (`data.json`, `availability.json`, notices, Daily) | Network first, with a timeout; see below |

On install it precaches the whole `_app` build (minus the icon font's woff and ttf fallbacks),
the logo, favicon and manifest, and the shell, all in a cache named after `version`. The shell is
fetched with `cache: 'reload'` so it matches that deploy's `_app` files. The new worker activates
at once and deletes the previous version's cache. Runtime JSON lives in a separate `data` cache
that survives deploys.

Page navigations use navigation preload, so the page download starts while the worker boots. If the
page takes longer than 3 seconds (`NAVIGATE_TIMEOUT_MS`) or the network fails, the cached shell is
served instead and the SPA routes client-side, so launching the installed app on a weak signal
doesn't sit on a blank screen.

Runtime JSON is fetched fresh, but once a stored copy exists the worker waits at most 5 seconds
(`DATA_TIMEOUT_MS`) for the whole file before serving that copy instead. The download carries on
in the background, so the next load gets fresh data. A download cut off midway also falls back to
the stored copy. Responses from the stored copy carry an `x-alkometriikka-cached` header
(`src/lib/utils/app/offline.ts`); `+layout.ts` exposes it for `data.json` as `alko.cached`, which
[the notice banner](features.md#site-notices) uses.

SvelteKit's generated tsconfig leaves the service worker out (it needs the `webworker` libs), so
it imports from `src/lib` with relative paths, and `bun run check` doesn't type-check it.

Product photos from `images.alko.fi` aren't handled: they are sent with a one-year
`max-age`, so photos already seen load from the HTTP cache offline anyway.

## Installed app

- **Manifest** (`static/manifest.json`): shortcuts use the trailing-slash URLs the router expects,
  `launch_handler` reuses an open app window, and `share_target` receives shares (see the `/jaa/`
  route below). Its screenshots (`static/images/screenshots/`, shown in Chrome's install dialog)
  are captured by hand from a production build in light mode: phone at 390×844 @3x, desktop at
  1440×900 @1.5x, saved as WebP. Retake them when the pages they show change noticeably.
- **System bar colour**: `app.html`'s `theme-color` tags match the loader (white, or `#52000A` in
  dark mode). Once the loader is gone, `+layout.svelte` sets them to the header colour of the
  app's own theme, which can differ from the OS one.
- **`color-scheme`** follows the app's `dark` class, so scrollbars and form controls match.
- **Install button**: Settings → Lisäasetukset offers installing. `app.html` keeps Chrome's
  `beforeinstallprompt` event (it can fire before the app's code loads) and
  `src/lib/utils/app/pwa.svelte.ts` shows its prompt from the button. iOS has no prompt, so it gets the
  Add to Home Screen steps instead, except in apps' built-in browsers (Instagram, Facebook…), which can't add to the home screen. Inside the installed app the section is hidden. The same
  offer shows as a banner under the header (`InstallBanner.svelte`) from the second day the site
  is used on (`BANNER_AFTER_DAYS`), until it's closed or the browser's install dialog is turned
  down.
- **Updates while open**: an installed app can sit in the background for days, and the browser
  only looks for a new service worker on page loads. Coming back into view checks again (at most
  every 10 minutes). If a new deploy's worker takes over, the next in-app link does a full page
  load, so the page doesn't keep running old code that asks for removed `_app` files.
- **New data while open**: data syncs don't change the app's version, so the check above misses
  them, and the price list loads once per page load. Coming back into view after at least 30
  minutes away (`DATA_CHECK_AFTER_HIDDEN_MS`) sends a HEAD request for `data.json` and reloads the
  page if its `Last-Modified` is later than the loaded copy's. Otherwise an app left open would
  show the stale-data warning although CI has published newer data.
- **iOS launch screens**: iOS ignores the manifest's splash and needs an `apple-touch-startup-image`
  per screen size, orientation and colour scheme. `bun run pwa:splash`
  (`scripts/pwa/ios-splash.ts`) draws the loader's first frame into `static/ios/splash/` and
  writes an inline script into `app.html` between its markers that adds the 88 link tags on
  iPhones and iPads only. As plain tags they'd add ~21 KB to every prerendered page (~300 MB
  across the site). Rerun it when Apple ships a new screen size or the loader changes.

## Routes

| Route                             | Page                                   | Loader notes                                                                           |
| --------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------- |
| `/`                               | Product list with search and filters   |                                                                                        |
| `/tuotteet/[...id]/`              | Product page                           | 404 if the id isn't in the catalog                                                     |
| `/[lang]/tuotteet/[...id]`        | Redirect to `/tuotteet/[id]/`          | Mirrors alko.fi's `/fi/tuotteet/…` paths, so swapping the domain in an Alko link works |
| `/vastaavat/[...id]`              | Similar products                       | 404 if the id is unknown                                                               |
| `/vertailu?ids=a,b,c`             | Side-by-side comparison                | Redirects to `/` without `ids`                                                         |
| `/listat`                         | Saved lists, or one list with `?list=` | 400 if the `list` parameter can't be decoded                                           |
| `/kategoriat/`                    | Category index                         |                                                                                        |
| `/kategoriat/[type]/[[subtype]]/` | Category page                          | 404 if the slugs don't match the category tree                                         |
| `/hinnanmuutokset`                | Recent price changes                   |                                                                                        |
| `/seuratut`                       | Watched products and their changes     |                                                                                        |
| `/tilastot`                       | Catalog statistics and charts          |                                                                                        |
| `/laskin`                         | Alcohol / BAC calculator               | Doesn't need the dataset                                                               |
| `/myymalat`                       | Store list                             |                                                                                        |
| `/myymalat/[storeID]/`            | Store page                             | 404 if the store is unknown                                                            |
| `/kompassi`                       | Compass pointing to the nearest store  |                                                                                        |
| `/daily`                          | Daily quiz                             |                                                                                        |
| `/daily/arkisto`                  | Daily archive calendar                 |                                                                                        |
| `/daily/arkisto/[date]`           | One archived Daily game                |                                                                                        |
| `/jaa/?title=&text=&url=`         | Redirect for content shared to the app | Opens the product an Alko link points to, otherwise searches the shared words          |

`src/routes/+error.svelte` and `src/routes/myymalat/+error.svelte` render 404s and other errors.
Each page is described in [Features](features.md).

Pages render through view components in `src/lib/components/views/` (`Main`, `Product`,
`Category`, `List`, `Compare`, `PriceChanges`, `SimilarProducts`, `Stats`). Route files mostly
await the data and pass it in.

## Components

| Directory              | Contents                                                                                                                                                                                                                                                        |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `components/views/`    | One per page type, listed above                                                                                                                                                                                                                                 |
| `components/product/`  | The sections of the product page (gallery, price panel, size dropdown, history chart, availability…)                                                                                                                                                            |
| `components/category/` | Category page sidebar sections (stats, price changes, collapsible section)                                                                                                                                                                                      |
| `components/widgets/`  | Reusable pieces: `Filters`, `ProductPreview` (list row), `Popup` (dialog), `Badge`/`BadgeList`, `ChartCard`, `Histogram`, `NoticeBanner`, `CompareBar`, `BottomBar`, `AllLists`, `CompassDial`, `StoreCompass`, `FeedbackDialog`, `DailyFeedback`, `Settings/`… |
| `components/inputs/`   | Filter inputs: `StringInput` (multi-select, optionally grouped), `NumberInput` (range), `RecursiveFilter` (nested sub-filters)                                                                                                                                  |

`widgets/Barcode.svelte` (EAN-13/QR scanner using `barcode-detector`) is in the tree but not
mounted anywhere at the moment. Its EAN lookup could only match removed products that kept a
legacy EAN, since API-synced products have none.

## Global state

`src/lib/global.svelte.ts` holds app-wide state as Svelte 5 `$state` objects and stores:

| Export                              | Type     | Persisted (localStorage key)    | Meaning                                                         |
| ----------------------------------- | -------- | ------------------------------- | --------------------------------------------------------------- |
| `personalInfo`                      | `$state` | `personal_info`                 | Weight and gender for BAC estimates                             |
| `lists`                             | `$state` | `lists`                         | The user's saved lists                                          |
| `compareProductIds`                 | `$state` | `compare_products`              | Products queued for comparison (max 6)                          |
| `watchlist`                         | `$state` | `watchlist`                     | Watched products and what the user last saw of them             |
| `punchDraft`                        | `$state` | `punch_draft`                   | The recipe open in the punch calculator                         |
| `punchRecipes`                      | `$state` | `punch_recipes`                 | Punch recipes saved by name                                     |
| `compareHighlightDifferences`       | store    | `compare_highlight_differences` | Comparison table dims identical rows                            |
| `theme`                             | store    | `theme`                         | `''` (system), `'light'` or `'dark'`                            |
| `preferredStoreId`                  | store    | `preferred_store`               | A store id, or `'auto'` for the nearest store                   |
| `onlyPreferredStore`                | store    | `only_preferred_store`          | Category and price change pages show only that store's products |
| `userLocation`                      | store    | `user_location`                 | Last device location, for `'auto'` and distances                |
| `locationDenied`                    | store    | —                               | The browser denied geolocation                                  |
| `searchQuery`                       | store    | —                               | The header search box (`?q=`)                                   |
| `pageBottomBar`                     | `$state` | —                               | Snippet a page hands to the layout for its mobile action bar    |
| `isMobile`, `isLaptop`              | stores   | —                               | Viewport below 48rem / 1280px, updated on resize                |
| `isSafari`, `isFirefox`, `isChrome` | stores   | —                               | User-agent sniffing for browser quirks                          |

The layout's `$effect`s write each persisted value back to localStorage whenever it changes.
`LocalStorageManager` (`src/lib/utils/app/storage.ts`) wraps localStorage with a typed key map and
swallows the errors browsers throw when storage is blocked. All keys are listed in
`LocalStorageKeys` (`src/lib/utils/constants/app.ts`); the Daily game's own keys are described in
[Daily game](../daily-game.md#player-state).

## URL state

Shareable state lives in the query string, managed by `SearchParamsManager`
(`src/lib/utils/app/url.ts`), which the layout puts in context under
`ContextKeys.SearchParamsManager`. Pages set parameters on it and call `update()`, which writes
the URL with `replaceState` (no history entries). Calls made before the router is ready are
queued and flushed by `markRouterReady()` in `afterNavigate`.

Once the query string passes 400 characters, `update()` moves it into a `#z=` fragment instead:
the parameters grouped by key (repeated filter names are most of a long query) and compressed with
lz-string (`src/lib/utils/app/compressedParams.ts`). Browsers never send the fragment, so even
"Valitse kaikki" on a filter with thousands of values can't make a reload fail with 414 (GitHub
Pages refuses URLs over about 8 KB). Only `sid`, `flag` and `list` stay in the query. The manager
expands `z` when it reads a URL, and code that reads the query string itself goes through
`readSearchParams()`, so a compressed link behaves like the long one.

| Parameter                             | Used on                 | Meaning                                                                                                                              |
| ------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `q`                                   | lists with a search box | Name search                                                                                                                          |
| `<column name>`                       | `/`, list pages         | A filter, e.g. `?Tyyppi=Viinit&Tyyppi=Oluet` (or `Viinit,Oluet`) or `?Hinta=5-20` (see [Kaljakori](kaljakori.md#filters-in-the-url)) |
| `sort`, `asc`, `highlight`            | `/`                     | Sort column, direction, highlighted column (omitted when default)                                                                    |
| `removed`                             | `/`                     | `true` when removed products are shown                                                                                               |
| `list`                                | `/listat`               | An lz-string compressed list                                                                                                         |
| `ids`                                 | `/vertailu`             | Comma-separated product numbers                                                                                                      |
| `pv`, `suunta`, `tyyppi`, `alatyyppi` | `/hinnanmuutokset`      | Window (7/30/90 days), direction (`halpeni`/`kallistui`), category slugs                                                             |
| `sid`                                 | any shared link         | Share id for counting shared views; stripped on arrival                                                                              |
| `#z=` (fragment)                      | any page                | The other parameters compressed, when the query string would be long                                                                 |

The search box text belongs to the page it was typed on: navigating to a different path clears it,
while back/forward restores it from the URL.

## Navigation and layout

- The header has the logo, the search box (hidden on pages without a product list), a "Lisää"
  menu, links to Daily and Listat, and the settings button. The menu (`menuGroups` in the layout)
  groups its links under Selaa (Kategoriat, Hinnanmuutokset, Tilastot), Omat
  (Seuratut, Listat), Myymälät (Myymälät, Kompassi) and Työkalut (Laskin, Daily-arkisto), and
  marks the current page. When watched products have changed, Seuratut shows how many and the
  menu button gets a green dot.
- `/` focuses the search box from anywhere that isn't a text field.
- On phones, pages pass a snippet into `pageBottomBar` (filter button, product price/compare bar)
  and the layout renders it at the very bottom, below the compare bar.
- Dark mode follows the system unless the user picks light or dark in settings.
- `appPath()` (`src/lib/utils/app/paths.ts`) and `resolve()` from `$app/paths` prefix internal links
  with the base path so branch previews built under `BASE_PATH` work.

## SEO in the client

Pages call `setSEO()` (`src/lib/utils/app/meta.ts`) to update the description, keywords, Open Graph
and Twitter tags after navigation, and `generateTitle()` for `<title>`. Copy that both the client
and the prerender scripts need (product descriptions, store descriptions, static page titles) is
in `src/lib/utils/app/seo.ts` and `categories.ts`, so the stub a crawler sees and the tags set after
hydration match. Feed `<link>` tags baked into a prerendered page are removed after the first
client-side navigation.

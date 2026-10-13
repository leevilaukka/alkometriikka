# App structure

The app is SvelteKit 2 with Svelte 5, built with `@sveltejs/adapter-static` into a client-only
SPA. TypeScript throughout, Tailwind v4 for styling.

## Build configuration

- **`svelte.config.js`**: static adapter writing to `build/` with `fallback: '404.html'`.
  `paths.base` comes from `BASE_PATH` (empty in dev). `version.name` is the short git commit
  hash, shown in the settings dialog and sent with site feedback.
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
  `Kaljakori`. It also carries the parsed `dataset` (table + metadata) and a lazily filled
  `availability`.
- **`alkoWithStores`** resolves to the same object, but only after `availability.json` has also
  been applied.

`availability.json` is requested in parallel with `data.json` but parsed only after the first
render, in a `requestIdleCallback` (`LazyAvailability` in `src/lib/alko/availability.svelte.ts`).
Its `current` and `loaded` fields are `$state`, so templates that read them update when it
arrives, and `Kaljakori.setAvailability` fills the store column in place. Pages that can't render
without store data await `alkoWithStores`:

| Route                                                | Waits for store data when…                  |
| ---------------------------------------------------- | ------------------------------------------- |
| `/` (main list)                                      | the URL has a `Myymälät` filter             |
| `/tuotteet/[id]`                                     | always (shows availability)                 |
| `/myymalat/[storeID]`                                | always                                      |
| `/kategoriat/[type]/[[subtype]]`, `/hinnanmuutokset` | "only my store" is on and a store is chosen |
| `/kompassi`                                          | the store list is read from it              |

If `data.json` fails to load, the layout shows the error with a retry button. If
`availability.json` fails, the app continues with empty store data.

`+layout.svelte` awaits `data.alko`, removes the loader, and renders the header, the
[notice banner](features.md#site-notices), the page, the compare bar and the page's mobile bottom
bar.

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
| `/tilastot`                       | Catalog statistics and charts          |                                                                                        |
| `/laskin`                         | Alcohol / BAC calculator               | Doesn't need the dataset                                                               |
| `/myymalat`                       | Store list                             |                                                                                        |
| `/myymalat/[storeID]/`            | Store page                             | 404 if the store is unknown                                                            |
| `/kompassi`                       | Compass pointing to the nearest store  |                                                                                        |
| `/daily`                          | Daily quiz                             |                                                                                        |
| `/daily/arkisto`                  | Daily archive calendar                 |                                                                                        |
| `/daily/arkisto/[date]`           | One archived Daily game                |                                                                                        |

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
| `components/inputs/`   | Filter inputs: `StringInput` (multi-select), `NumberInput` (range), `RecursiveFilter` (nested sub-filters)                                                                                                                                                      |

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
`LocalStorageManager` (`src/lib/utils/storage.ts`) wraps localStorage with a typed key map and
swallows the errors browsers throw when storage is blocked. All keys are listed in
`LocalStorageKeys` (`src/lib/utils/constants.ts`); the Daily game's own keys are described in
[Daily game](../daily-game.md#player-state).

## URL state

Shareable state lives in the query string, managed by `SearchParamsManager`
(`src/lib/utils/url.ts`), which the layout puts in context under
`ContextKeys.SearchParamsManager`. Pages set parameters on it and call `update()`, which writes
the URL with `replaceState` (no history entries). Calls made before the router is ready are
queued and flushed by `markRouterReady()` in `afterNavigate`.

| Parameter                             | Used on                 | Meaning                                                                                                          |
| ------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `q`                                   | lists with a search box | Name search                                                                                                      |
| `<column name>`                       | `/`, list pages         | A filter, e.g. `?Tyyppi=Viinit&Tyyppi=Oluet` or `?Hinta=5-20` (see [Kaljakori](kaljakori.md#filters-in-the-url)) |
| `sort`, `asc`, `highlight`            | `/`                     | Sort column, direction, highlighted column (omitted when default)                                                |
| `list`                                | `/listat`               | An lz-string compressed list                                                                                     |
| `ids`                                 | `/vertailu`             | Comma-separated product numbers                                                                                  |
| `pv`, `suunta`, `tyyppi`, `alatyyppi` | `/hinnanmuutokset`      | Window (7/30/90 days), direction (`halpeni`/`kallistui`), category slugs                                         |
| `sid`                                 | any shared link         | Share id for counting shared views; stripped on arrival                                                          |

The search box text belongs to the page it was typed on: navigating to a different path clears it,
while back/forward restores it from the URL.

## Navigation and layout

- The header has the logo, the search box (hidden on pages without a product list), a "Lisää"
  menu (Kategoriat, Hinnanmuutokset, Myymälät, Daily-arkisto, Laskin, Tilastot), links to Daily
  and Listat, and the settings button.
- `/` focuses the search box from anywhere that isn't a text field.
- On phones, pages pass a snippet into `pageBottomBar` (filter button, product price/compare bar)
  and the layout renders it at the very bottom, below the compare bar.
- Dark mode follows the system unless the user picks light or dark in settings.
- `appPath()` (`src/lib/utils/paths.ts`) and `resolve()` from `$app/paths` prefix internal links
  with the base path so branch previews built under `BASE_PATH` work.

## SEO in the client

Pages call `setSEO()` (`src/lib/utils/helpers.ts`) to update the description, keywords, Open Graph
and Twitter tags after navigation, and `generateTitle()` for `<title>`. Copy that both the client
and the prerender scripts need (product descriptions, store descriptions, static page titles) is
in `src/lib/utils/seo.ts` and `categories.ts`, so the stub a crawler sees and the tags set after
hydration match. Feed `<link>` tags baked into a prerendered page are removed after the first
client-side navigation.

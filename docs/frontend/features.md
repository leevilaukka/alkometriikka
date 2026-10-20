# Features

One section per user-facing feature: what it does and where the code is. For how the data
behind them is shaped, see [Kaljakori](kaljakori.md) and [Calculations](calculations.md).

## Product list and search (`/`)

`src/routes/+page.svelte` → `views/Main.svelte`

The home page lists every product in a virtualized list (`@humanspeak/svelte-virtual-list`), one
`ProductPreview` row each.

- **Search**: the header box matches product names, typo-tolerant for queries of four or more
  characters. Press `/` to focus it.
- **Filters**: the sidebar (`widgets/Filters.svelte`; a dialog on phones, opened from the bottom
  bar). Columns in `shownFilters` appear as multi-selects or ranges. Multi-selects are OR for
  single-valued columns (category, producer, country, store…) and AND for set columns (taste,
  grapes, notes, food pairings). Child filters narrow to the selected parent (wine subtypes under
  Viinit). String filters with only one possible value (e.g. Uutuus, Alennuksessa) are shown as
  on/off pills instead of dropdowns.
- **Show removed products**: off by default. Removed products and filter options that only exist
  on them are hidden until it's turned on.
- **Sort** by any of `shownSortingKeys`; the default is alcohol grams per euro, descending.
- **Highlight**: shows a bar in each row proportional to the chosen column's value against the
  list's maximum.
- **Row actions**: add to a list, add to comparison, open the product.
- Everything above is reflected in the URL, so a filtered list can be shared (see
  [App structure → URL state](app-structure.md#url-state)).

Filter usage is reported as one analytics event per filtering session, not per click
(`trackFilterUsage` in `src/lib/utils/app/filterAnalytics.svelte.ts`).

## Product page (`/tuotteet/[id]/`)

`views/Product.svelte` and the sections in `components/product/`:

| Section                | Component                                | Shows                                                                                                                   |
| ---------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Breadcrumb             | `ProductBreadcrumb`                      | Category trail, linked when the category has a page                                                                     |
| Gallery                | `ProductGallery`                         | Alko's product photo                                                                                                    |
| Badges and header      | `ProductBadgesHeader`                    | Name, producer (links to the list filtered to that producer), badges                                                    |
| Price and store banner | `ProductPriceStoreBanner`                | Price, sale info, and whether the preferred store has it (or the closest store that does)                               |
| Size selector          | `ProductSizeDropdown`, `ProductSizeHook` | Other package sizes with price per litre, cheapest marked ([how matching works](calculations.md#other-sizes))           |
| Quick stats            | `ProductQuickStats`                      | 2×2 grid of headline numbers                                                                                            |
| Price panel            | `ProductPricePanel`                      | Desktop side panel: price, add to list, compare, share                                                                  |
| Hinta-laatu            | `ProductQualityMetrics`                  | Percentile bars against the category ([metrics](calculations.md#quality-metrics-hinta-laatu))                           |
| Similar products       | `ProductSimilar`                         | Top 24 similar active products, with a one-tap "compare with this"                                                      |
| Price history          | `ProductPriceHistory`                    | Chart.js line chart with sale periods shaded, range selector, link to the product's RSS feed once its price has changed |
| Details                | `ProductDetailsTable`                    | All other columns; food pairings link to the list filtered by that pairing and type                                     |
| Store availability     | `ProductStoreAvailability`               | Stores stocking it, sorted by distance from the preferred store, with "updated N minutes ago"                           |
| Mobile CTA             | `ProductMobileCta`                       | Bottom bar on small screens: price, compare, add to list                                                                |

The store availability header also shows the store count trend over the last 30 days with a
sparkline (`ProductStockTrend`), once the [stock history](../data/stock-history.md) has two days
for the product.

**Seuraa** (`ProductWatchButton`) adds the product to the [watchlist](#watchlist-seuratut). Opening
a watched product shows what changed since the last visit above the page, then counts as seeing it.

Removed products still have a page with a "Poistettu valikoimasta" badge. Every product also has
a prerendered stub for crawlers ([Site generation](../site-generation.md#product-pages)).

## Categories (`/kategoriat/`)

`routes/kategoriat/` → `views/Category.svelte`, `components/category/`

The category tree (Tyyppi → Alatyyppi) is built from active products by `buildCategoryTree`
(`src/lib/utils/catalog/categories.ts`). A category needs at least 5 active products to get a page, and a
subtype with the same slug as its parent (Viinit › viinit) is treated as a catch-all and skipped.
Slugs are lower-cased and accent-stripped ("Väkevät" → `vakevat`).

- `/kategoriat/` lists every type with its subtype chips and counts.
- `/kategoriat/<type>/` and `/kategoriat/<type>/<subtype>/` show the category's products through
  `Main` (without the filter sidebar), plus a sidebar with stats (medians, price-per-litre
  histogram), recent price changes, cheapest product and most alcohol per euro, links to sibling
  categories, the category's RSS feed, "open in the full list with filters", and "compare the
  highlights".
- With **only my store** on, everything on the page is limited to products available in the
  preferred store.

## Price changes (`/hinnanmuutokset`)

`views/PriceChanges.svelte`, helpers in `src/lib/utils/stats/priceChanges.ts`

Each active product's latest price change within the last 7, 30 (default) or 90 days, newest
first. Filter by direction (cheaper / more expensive), category chips with counts, name search,
and optionally only the preferred store. All choices are in the URL (`?pv=7&suunta=halpeni&tyyppi=viinit`).
Links to the site RSS feed.

## Lists (`/listat`)

`views/List.svelte`, `widgets/AllLists.svelte`, `src/lib/utils/user/lists.ts`

Users create named lists of products with quantities, stored in localStorage. A list page shows
the products with search, filters and sorting, and totals for the whole list: item count, price,
volume, alcohol grams, grams per euro, sugar and an estimated ‰.

**Sharing**: a list is shared as `/listat?list=<data>`, where `<data>` is the list's JSON
compressed with lz-string. No server is involved. If the id matches one of the visitor's own lists
it opens that list for editing; otherwise it is shown read-only with a button to save a copy. The
first six products in the current order can be opened in the comparison view.

## Watchlist (`/seuratut`)

`views/Watchlist.svelte`, `widgets/WatchlistBanner.svelte`, `src/lib/utils/user/watchlist.ts`

Products are watched from the product page. Each watched product keeps a snapshot of what the user
last saw: price, whether it was in the selection, how many stores had it and whether the preferred
store did. Comparing it with the current data gives the changes: got cheaper or dearer, removed or
back in the selection, sold out everywhere or back in stores, arrived in or left the preferred
store. Store changes are only compared once `availability.json` has loaded, and only for the same
preferred store, so switching stores isn't reported as a change.

- `/seuratut` lists watched products, changed ones first, with "Nähty" per product and "Merkitse
  kaikki nähdyiksi".
- The front page shows a banner summarising the changes ("2 halpeni, 1 tuli myymälääsi") while
  there are any.
- Opening the product marks it seen. Everything stays in localStorage (`watchlist`) and is part of
  the settings export.

## Comparison (`/vertailu?ids=…`)

`views/Compare.svelte`, `widgets/CompareBar.svelte`, `src/lib/utils/user/compare.ts`

Up to 6 products side by side. Products are added from list rows, product pages and the similar
products row. While any are queued, the compare bar is shown at the bottom of every page. The
table highlights the best value per row and can dim rows where all products are equal
("highlight differences", remembered in localStorage). The page URL carries the product ids, so a
comparison can be shared.

## Similar products (`/vastaavat/[id]`)

`views/SimilarProducts.svelte`

The full ranked list of products similar to one product ([scoring](calculations.md#similar-products)).

## Statistics (`/tilastot`)

`views/Stats.svelte`, `widgets/ChartCard.svelte`, `src/lib/utils/stats/stats.ts`

Catalog-wide charts with Chart.js: price, price-per-litre and ABV distributions, category,
subcategory and country breakdowns, a price vs alcohol-per-euro scatter plot, and the best-value
ranking. Drunk-value charts follow the user's personal info.

## Calculator (`/laskin`)

`routes/laskin/+page.svelte`

Enter volume, ABV and price to get alcohol grams, grams per euro, servings and an estimated ‰.
Uses the saved weight and gender by default, with a toggle to enter other values for one
calculation.

## Stores (`/myymalat`, `/myymalat/[id]/`)

`routes/myymalat/`, helpers in `src/lib/utils/catalog/availability.ts`

- `/myymalat` lists all stores with search, open/closed status, and a button to make one the
  preferred store.
- A store page shows the address, today's status, opening hours for the coming days, extra info
  from Alko, a link to the main list filtered to that store, Google Maps directions, Alko's store
  page, and a compass to the store on phones.

Opening hours are evaluated in Europe/Helsinki time and accept Alko's `9–21` format as well as
`HH:MM` variants (`isStoreOpen`).

### Preferred store

Chosen in settings, on the store list or a store page. It can be a specific store or **auto**,
which follows the store nearest the device's location (`resolvePreferredStore`). Location is
requested only when needed, reused for 10 minutes, and refreshed when the tab regains focus
(`src/lib/utils/device/location.ts`). The product page uses the preferred store for its availability
banner and distance sorting; category and price change pages can be limited to it.

### Store page sections

`components/store/StoreHighlights.svelte`, `src/lib/utils/catalog/storeHighlights.ts`

Below the store's details, from the products it stocks (each list shows five, "Näytä kaikki" for
the rest):

- **Tullut myymälään**: arrivals of the last 30 days from the
  [stock history](../data/stock-history.md#files), hidden while it's warming up
- **Uutuudet**: Alko's new products in the store
- **Alennuksessa**: products on sale, biggest discount first
- **Eniten alkoholia eurolla**: the best alcohol per euro in each type

## Compass (`/kompassi`)

`routes/kompassi/+page.svelte`, `widgets/CompassDial.svelte`, `src/lib/utils/device/compass.ts`,
`src/lib/utils/device/orientation.ts`

Points the phone towards the nearest store using geolocation and the device orientation API
(iOS asks for permission from a tap). It can be limited to open stores, a store can be skipped to
target the next one, and the target only switches when another store is at least 150 m closer so
it doesn't flicker between equidistant stores. The store page embeds the same dial
(`StoreCompass.svelte`) for that store, on devices that report a heading.

## Daily (`/daily`, `/daily/arkisto`)

A seven-question quiz about the catalog, the same for everyone each day. Covered in its own page:
[Daily game](../daily-game.md).

## Settings dialog

`widgets/Settings/`

Opened from the cog in the header (other code can open it with `requestSettingsOpen()` from
`src/lib/utils/app/settings.ts`). Three tabs:

- **Henkilökohtaiset tiedot**: weight, gender and preferred store.
- **Lisäasetukset**: theme (system/light/dark); export everything (personal info, preferred store,
  lists) as a JSON file and import it on another device; clear all stored data.
- **Tietoa**: about text, GitHub and contact links, RSS/JSON feed links, download links for
  `data.json` and `availability.json`, the app version (commit) and the last sync and update times
  linked to their workflow runs, and the site feedback form.

## Site notices

`widgets/NoticeBanner.svelte`, `src/lib/utils/app/notices.ts`, `static/notices.json`

Banners under the header, from two sources:

- **Manual notices** in `static/notices.json`, with optional start/end times, links, levels, and
  targeting by landing URL parameters. How to post one: [Operations → Posting a notice](../operations.md#posting-a-notice).
- **Automatic stale-data warning** when `metadata.LastSynced` is over 24 hours old (the sync runs
  every 6 hours, so several runs have failed). A manual notice with `replacesStaleWarning: true`
  hides it, to explain an outage instead.
- **Automatic cached-data notice** when the browser is offline, or the service worker served its
  stored copy of `data.json` because the network was too slow or failed (see
  [Offline support](app-structure.md#offline-support)). It gives the data's sync time and takes
  the stale warning's place, since old data then says nothing about the sync.

Dismissals are stored per notice id in localStorage. The stale warning's and cached-data notice's
ids include the sync time, so dismissing them lasts only until the data changes.

## Sharing

`handleShare()` in `src/lib/utils/app/share.ts`

Share buttons use the Web Share API where it's available (not in Firefox), otherwise copy the text
and link to the clipboard. Shared links get a random `sid` parameter; when someone opens the link,
a `shared_<type>_viewed` analytics event is sent once and `sid` is removed from the URL. The
sharer's own sid is remembered so their visit isn't counted.

The installed app is also a share target: sharing an Alko product page (from the Alko site or
app) to Alkometriikka opens that product, and sharing plain text searches for it. The manifest
sends shares to `/jaa/`, and `shareDestination()` in `src/lib/utils/app/shareTarget.ts` picks where
they go.

## Outbound links

External links are plain links. Clicks on them are recorded by the local copy of Simple
Analytics' auto-events script (`static/scripts/simpleanalytics/auto-events.js`), see
[Analytics and privacy](../analytics-and-privacy.md#outbound-links).

`static/linkki.html` and `generateOutLink()` in `src/lib/utils/app/share.ts` are an older
redirect page for tracking outbound clicks. Nothing in the app links through them at the moment;
they are kept for possible future use.

## Feedback

- **Site feedback** (`Settings/SiteFeedback.svelte`): pick categories such as wrong product info,
  missing image, broken search or filters, crash, UI bug. Sent as a `site_feedback` analytics event
  with the path and app version.
- **Daily feedback** (`widgets/DailyFeedback.svelte`): report a problem with a specific Daily
  question (wrong answer, price, image, unclear question).

Both use the shared `FeedbackDialog.svelte`. There is no backend; feedback is read from the
analytics dashboard.

## Removed products

Products that leave Alko's selection stay in the data with a removal date
([Dataset format](../data/dataset-format.md#products)). In the app they are:

- hidden from lists unless "show removed" is on, and their exclusive filter options with them;
- excluded from category trees, similar-product suggestions, size options, quality metric peers,
  category stats and price changes;
- still reachable by URL, with a "Poistettu valikoimasta" badge, and still in shared lists.

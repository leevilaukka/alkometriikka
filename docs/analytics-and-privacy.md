# Analytics and privacy

Alkometriikka has no accounts and no backend that stores user data. Everything personal stays in
the visitor's browser. Usage is measured with privacy-focused analytics.

## Analytics providers

All three are loaded from `src/app.html`:

| Provider                 | Loaded from                                    | Notes                                                                                                                                                                                |
| ------------------------ | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Umami (self-hosted)      | `https://analytics.alkometriikka.fi/script.js` | Main event analytics. `data-exclude-search` (query strings aren't recorded with pageviews), `data-do-not-track`, performance metrics on. Also loads the Umami session `recorder.js`  |
| Simple Analytics         | `scripts.simpleanalyticscdn.com/latest.js`     | Plus `static/scripts/simpleanalytics/auto-events.js`, a local copy of their auto-events script for outbound links, email links and downloads (see [Outbound links](#outbound-links)) |
| Cloudflare Web Analytics | `static.cloudflareinsights.com/beacon.min.js`  | Page loads and web vitals                                                                                                                                                            |

In `vite dev`, the layout sets `localStorage['umami.disabled'] = '1'` and `sendAnalyticsEvent`
only logs to the console, so local work never reaches the dashboards.

## Custom events

All custom events go through `sendAnalyticsEvent(name, params)` in `src/lib/utils/app/analytics.ts`,
which sends to both Simple Analytics (`sa_event`) and Umami (`umami.track`). Event names and
payloads are typed by `AnalyticsEventMap` in `src/lib/types.ts`; add new events there first.

| Event                                                    | Sent when                                                                                                                                                   | Payload                                                                                     |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `filters_used`                                           | A filtering session ends (opening a product, navigating away, hiding the tab) with a new, non-empty filter combination                                      | Source page, how it ended, active filters and their values, number of changes, result count |
| `calculator_used`                                        | The calculator settles on a result (debounced)                                                                                                              | Inputs, results, whether saved personal values were used                                    |
| `view_compare`                                           | The comparison page opens                                                                                                                                   | Product numbers and URL (the pathname alone doesn't identify the comparison)                |
| `add_to_compare`                                         | A product is added to the comparison                                                                                                                        | Product number                                                                              |
| `view_sizes`, `show_product_details`                     | The size selector / details are opened on a product page                                                                                                    | Product number                                                                              |
| `create_list`, `save_list`                               | A list is created / a shared list is saved                                                                                                                  |                                                                                             |
| `preferred_store_changed`                                | A preferred store is chosen                                                                                                                                 | Store id, name, city                                                                        |
| `store_compass_opened`                                   | The store compass is opened                                                                                                                                 | Store id and name                                                                           |
| `open_settings`, `export_data`, `import_data`            | Settings actions                                                                                                                                            |                                                                                             |
| `install_app`, `app_installed`, `dismiss_install_banner` | The install prompt (from Settings or the banner) is answered / the app gets installed (any way) / the install banner is closed                              | Whether the prompt was accepted, and from where                                             |
| `pwa_launch`                                             | The site is opened as the installed app, once per launch. Counts installed-app use on every platform, iOS included, where installs themselves can't be seen |                                                                                             |
| `click_feed`                                             | An RSS/JSON feed link is clicked                                                                                                                            | Which feed, where                                                                           |
| `share_<type>`                                           | Something is shared                                                                                                                                         | URL and share id                                                                            |
| `shared_<type>_viewed`                                   | A shared link is opened by someone other than the sharer, once per share id                                                                                 | URL and share id                                                                            |
| `daily_game`, `unlimited_game`, `archive_game`           | A Daily game is started or completed                                                                                                                        | Date, state, score, correct answers                                                         |
| `daily_feedback`                                         | A problem with a Daily question is reported                                                                                                                 | Date, mode, question, game hash, reported problem types                                     |
| `site_feedback`                                          | The site feedback form is sent                                                                                                                              | Path, app version, reported problem types                                                   |
| `scan_barcode`, `scan_qr_code`                           | The (currently unmounted) barcode scanner finds a product                                                                                                   | Code and link                                                                               |
| `app_error`                                              | An unexpected error: a failed page load or render, an uncaught exception or an unhandled promise rejection                                                  | Kind, message, stack, status, route, path (no query string), app version                    |
| `page_not_found`                                         | The error page shows a 4xx status: a route that doesn't exist, an unknown product, category or store, or an unreadable list link (400)                      | Status, route (`null` for a missing route), message, path (no query string), app version    |

`app_error` is sent from `src/hooks.client.ts` through `reportError` in
`src/lib/utils/app/errorAnalytics.ts`. Each error is sent once per page load, at most five per
load, and only after the analytics scripts have loaded. Errors from other origins (extensions,
third-party scripts) are skipped. `page_not_found` is sent by the error pages
(`src/routes/+error.svelte`, `src/routes/myymalat/+error.svelte`) through `reportPageNotFound`,
so that missing pages, mostly old links to delisted products, don't drown out real errors.

Share types are `page`, `list`, `product`, `filters`, `similar`, `compare` and `daily_game`
(`ShareTypes` in `src/lib/utils/constants/app.ts`).

`show_price_history` and `show_availability` are declared in `AnalyticsEventMap` but nothing sends
them since those product page sections became always visible.

The site and Daily feedback forms have no backend of their own: the event _is_ the feedback, read
from the Umami dashboard.

## What is stored in the browser

localStorage (keys in `LocalStorageKeys`, `src/lib/utils/constants/app.ts`):

| Key                                                 | Contents                                                                             |
| --------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `personal_info`                                     | Weight and gender, if entered                                                        |
| `preferred_store`, `only_preferred_store`           | Preferred store setting                                                              |
| `user_location`, `user_location_updated_at`         | Last device location, if the user allowed it (for the nearest store)                 |
| `lists`                                             | Saved lists                                                                          |
| `compare_products`, `compare_highlight_differences` | Comparison queue and setting                                                         |
| `theme`                                             | Light/dark/system                                                                    |
| `dismissed_notices`                                 | Ids of dismissed notices                                                             |
| `flag_overrides`                                    | The visitor's own `?flag=` choices ([Feature flags](#feature-flags))                 |
| `flag_visitor_id`                                   | Random UUID placing the visitor in rollouts; only created once a rollout needs it    |
| `viewed_shares`                                     | Share ids already counted, so views aren't counted twice                             |
| `alkometriikka-daily-*`                             | Daily progress, streak and archive scores ([Daily game](daily-game.md#player-state)) |
| `umami.disabled`                                    | Set in dev only                                                                      |

`lists_version`, `app_version` and `current_filters` are declared but not currently written.

sessionStorage holds the query parameters the visitor landed with, so URL-targeted notices stay
visible for the session.

Users can export their personal info, preferred store and lists as JSON, import them on another
device, or clear all of localStorage (flag keys included), from the settings dialog. Location is requested only on pages that need it (nearest store, compass) and is never
sent anywhere; distances are computed in the browser.

## Feature flags

Flags come from a static `flags.json` (see `src/lib/utils/flags/`). Evaluation happens entirely in
the browser: the file is fetched without any identifier, and `flag_visitor_id` never leaves the
device. The only thing sent is each flag that is on, as an Umami session property
(`flag_<name>: true`, via `umami.identify`), so reports can be filtered by flag. Flags that are off
aren't sent. A visitor who forces a flag with `?flag=name` is reported like any other visitor with
it on, so unreleased flag names can show up in the dashboard.

## Outbound links

Clicks on external links are recorded by `static/scripts/simpleanalytics/auto-events.js`, a
copy of Simple Analytics' auto-events script that is served from the site itself rather than
their CDN. It listens for clicks on outbound, `mailto:` and download links and sends events named
like `outbound_www_alko_fi`, with the link URL as metadata. The links themselves are ordinary
links, so no redirect is involved.

`static/linkki.html` (with `generateOutLink()` in `src/lib/utils/app/share.ts`) is the older
approach: a `noindex` redirect page that Simple Analytics recorded. It strips the referrer unless
the link passes `&referrer=1`, and only redirects to http(s) URLs on other hosts. Nothing links
through it at the moment, but it is kept for possible future use.

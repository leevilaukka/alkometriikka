# Analytics and privacy

Alkometriikka has no accounts and no backend that stores user data. Everything personal stays in
the visitor's browser. Usage is measured with privacy-focused analytics.

## Analytics providers

All three are loaded from `src/app.html`:

| Provider                 | Loaded from                                    | Notes                                                                                                                                                                               |
| ------------------------ | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Umami (self-hosted)      | `https://analytics.alkometriikka.fi/script.js` | Main event analytics. `data-exclude-search` (query strings aren't recorded with pageviews), `data-do-not-track`, performance metrics on. Also loads the Umami session `recorder.js` |
| Simple Analytics         | `scripts.simpleanalyticscdn.com/latest.js`     | Plus `static/scripts/simpleanalytics/auto-events.js`, their auto-events script for outbound links, email links and downloads                                                        |
| Cloudflare Web Analytics | `static.cloudflareinsights.com/beacon.min.js`  | Page loads and web vitals                                                                                                                                                           |

In `vite dev`, the layout sets `localStorage['umami.disabled'] = '1'` and `sendAnalyticsEvent`
only logs to the console, so local work never reaches the dashboards.

## Custom events

All custom events go through `sendAnalyticsEvent(name, params)` in `src/lib/utils/helpers.ts`,
which sends to both Simple Analytics (`sa_event`) and Umami (`umami.track`). Event names and
payloads are typed by `AnalyticsEventMap` in `src/lib/types.ts`; add new events there first.

| Event                                          | Sent when                                                                                                              | Payload                                                                                     |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `filters_used`                                 | A filtering session ends (opening a product, navigating away, hiding the tab) with a new, non-empty filter combination | Source page, how it ended, active filters and their values, number of changes, result count |
| `calculator_used`                              | The calculator settles on a result (debounced)                                                                         | Inputs, results, whether saved personal values were used                                    |
| `view_compare`                                 | The comparison page opens                                                                                              | Product numbers and URL (the pathname alone doesn't identify the comparison)                |
| `add_to_compare`                               | A product is added to the comparison                                                                                   | Product number                                                                              |
| `view_sizes`, `show_product_details`           | The size selector / details are opened on a product page                                                               | Product number                                                                              |
| `create_list`, `save_list`                     | A list is created / a shared list is saved                                                                             |                                                                                             |
| `preferred_store_changed`                      | A preferred store is chosen                                                                                            | Store id, name, city                                                                        |
| `store_compass_opened`                         | The store compass is opened                                                                                            | Store id and name                                                                           |
| `open_settings`, `export_data`, `import_data`  | Settings actions                                                                                                       |                                                                                             |
| `click_feed`                                   | An RSS/JSON feed link is clicked                                                                                       | Which feed, where                                                                           |
| `share_<type>`                                 | Something is shared                                                                                                    | URL and share id                                                                            |
| `shared_<type>_viewed`                         | A shared link is opened by someone other than the sharer, once per share id                                            | URL and share id                                                                            |
| `daily_game`, `unlimited_game`, `archive_game` | A Daily game is started or completed                                                                                   | Date, state, score, correct answers                                                         |
| `daily_feedback`                               | A problem with a Daily question is reported                                                                            | Date, mode, question, game hash, reported problem types                                     |
| `site_feedback`                                | The site feedback form is sent                                                                                         | Path, app version, reported problem types                                                   |
| `scan_barcode`, `scan_qr_code`                 | The (currently unmounted) barcode scanner finds a product                                                              | Code and link                                                                               |

Share types are `page`, `list`, `product`, `filters`, `similar`, `compare` and `daily_game`
(`ShareTypes` in `src/lib/utils/constants.ts`).

`show_price_history` and `show_availability` are declared in `AnalyticsEventMap` but nothing sends
them since those product page sections became always visible.

The site and Daily feedback forms have no backend of their own: the event _is_ the feedback, read
from the Umami dashboard.

## What is stored in the browser

localStorage (keys in `LocalStorageKeys`, `src/lib/utils/constants.ts`):

| Key                                                 | Contents                                                                             |
| --------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `personal_info`                                     | Weight and gender, if entered                                                        |
| `preferred_store`, `only_preferred_store`           | Preferred store setting                                                              |
| `user_location`, `user_location_updated_at`         | Last device location, if the user allowed it (for the nearest store)                 |
| `lists`                                             | Saved lists                                                                          |
| `compare_products`, `compare_highlight_differences` | Comparison queue and setting                                                         |
| `theme`                                             | Light/dark/system                                                                    |
| `dismissed_notices`                                 | Ids of dismissed notices                                                             |
| `viewed_shares`                                     | Share ids already counted, so views aren't counted twice                             |
| `alkometriikka-daily-*`                             | Daily progress, streak and archive scores ([Daily game](daily-game.md#player-state)) |
| `umami.disabled`                                    | Set in dev only                                                                      |

`lists_version`, `app_version` and `current_filters` are declared but not currently written.

sessionStorage holds the query parameters the visitor landed with, so URL-targeted notices stay
visible for the session.

Users can export all of it as JSON, import it on another device, or clear it, from the settings
dialog. Location is requested only on pages that need it (nearest store, compass) and is never
sent anywhere; distances are computed in the browser.

## Outbound links

External links go through `/linkki.html?to=<url>`, which strips the referrer unless the link
asks to keep it, only redirects to http(s) URLs on other hosts, and lets Simple Analytics record
the `to` parameter. It is excluded from indexing with `noindex`.

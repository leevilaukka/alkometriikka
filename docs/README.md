# Alkometriikka documentation

Technical documentation for [alkometriikka.fi](https://alkometriikka.fi/): how the data is
collected, how the site is built and deployed, and how each part of the app works.

The top-level [README](../README.md) is the public project overview. These pages are for
people working on the code. [`notes/`](../notes/) holds older design notes and investigations;
these pages describe the system as it is now and link to the notes where they add history or
detail.

## Contents

| Page                                              | What it covers                                                                        |
| ------------------------------------------------- | ------------------------------------------------------------------------------------- |
| [Architecture](architecture.md)                   | The moving parts, how data flows from Alko to the browser, where everything is hosted |
| [Development](development.md)                     | Local setup, npm scripts, environment variables, tests, conventions                   |
| **Data**                                          |                                                                                       |
| [Dataset format](data/dataset-format.md)          | `data.json`, `hashes.json`, `availability.json` and the column schema                 |
| [Sync pipeline](data/sync-pipeline.md)            | How `scripts/data/index.ts` fetches Alko's API, detects changes and stays safe        |
| [Stock history](data/stock-history.md)            | Daily store counts and store arrivals kept from `availability.json`                   |
| **Frontend**                                      |                                                                                       |
| [App structure](frontend/app-structure.md)        | SvelteKit setup, loading, routing, global state, URL state, localStorage              |
| [Kaljakori](frontend/kaljakori.md)                | The in-browser product database: parsing, filtering, search, subsets                  |
| [Calculations](frontend/calculations.md)          | Drunk values, sales, quality metrics, similar products, size matching                 |
| [Features](frontend/features.md)                  | Every page and user-facing feature, one section each                                  |
| **Generated content**                             |                                                                                       |
| [Daily game](daily-game.md)                       | Question generation, pinned manifests, archive, backups                               |
| [Site generation](site-generation.md)             | Prerendered SEO stubs, RSS/JSON feeds, sitemap, OG images, R2                         |
| **Operations**                                    |                                                                                       |
| [CI/CD](ci-cd.md)                                 | The four workflows, composite actions, secrets, the `gh-pages` branch                 |
| [Operations runbook](operations.md)               | Notices, forcing a sync, version constants to bump, recovery, the R2 CLI              |
| [Analytics and privacy](analytics-and-privacy.md) | Analytics providers, tracked events, what is stored in the browser                    |

## Glossary

The dataset and much of the UI use Finnish names. These come up everywhere in the code.

| Term                   | Meaning                                                                                                              |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Kaljakori              | "Beer crate". The class that holds the parsed product catalog in the browser (`src/lib/alko`)                        |
| Numero                 | Alko product number, the product id                                                                                  |
| Nimi / Valmistaja      | Name / producer                                                                                                      |
| Tyyppi / Alatyyppi     | Category / subcategory (shown in the UI as "Kategoria" / "Tyyppi")                                                   |
| Pullokoko              | Package size in litres                                                                                               |
| Hinta / Litrahinta     | Price / price per litre                                                                                              |
| Normaalihinta          | Reference price during a campaign (Alko's `lowest_30d_price`)                                                        |
| Valikoima              | Selection type (vakiovalikoima, tilausvalikoima, kausituote, erikoiserä…)                                            |
| Uutuus                 | New product                                                                                                          |
| Hintahistoria          | Price history                                                                                                        |
| Poistunut valikoimasta | Removed from Alko's selection. Products are never deleted, only flagged                                              |
| Myymälät               | Stores (the per-product store availability column)                                                                   |
| Hinnanmuutokset        | Price changes                                                                                                        |
| Listat / Vertailu      | Lists / comparison                                                                                                   |
| Vastaavat              | Similar products                                                                                                     |
| Laskin / Kompassi      | Calculator / compass                                                                                                 |
| Arkisto                | Archive (Daily game archive)                                                                                         |
| Promillet              | Blood alcohol in per mille (‰)                                                                                       |
| Drunk values           | The derived columns (alcohol grams, ‰, servings…) computed per product, see [Calculations](frontend/calculations.md) |

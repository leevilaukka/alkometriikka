# Feature cohesion audit (2026-11-10)

How the product features connect, where they don't, and the order to fix it in. Usage numbers are
Umami, country=FI, 2026-10-11..11-10 (see the bot-traffic caveat in the memory notes).

## 1. Features and routes, by role

| Role     | Feature                    | Route / entry point                                           |
| -------- | -------------------------- | ------------------------------------------------------------- |
| Discover | Catalogue, search, filters | `/` (739 views), header search box, `/` shortcut              |
| Discover | Command palette            | Ctrl/⌘K, search icon (38 opens, 30 selects)                   |
| Discover | Categories                 | `/kategoriat/…`                                               |
| Discover | Price changes              | `/hinnanmuutokset`                                            |
| Discover | Scanner                    | `/skanneri` (20 views, 9 scans); pinned header slot on phones |
| Discover | Daily                      | `/daily`, `/daily/arkisto` (menu, desktop header slot)        |
| Discover | Similar products           | product page row, `/vastaavat/[id]`                           |
| Evaluate | Product page               | `/tuotteet/[id]/` (most visits land here from search)         |
| Evaluate | Price history              | section of the product page, per-product RSS                  |
| Evaluate | Availability               | product page banner + store list, live counts from the Worker |
| Evaluate | Comparison                 | compare bar on every page, `/vertailu?ids=` (19 adds)         |
| Evaluate | Stats, calculator          | `/tilastot`, `/laskin`                                        |
| Act      | Lists                      | "Lisää" popup, `/listat` (16 created)                         |
| Act      | Punch calculator           | "Lisää" popup → "Lisää booliin", `/boolilaskuri`              |
| Act      | Watchlist                  | product page "Seuraa", `/seuratut`                            |
| Act      | Share                      | product, compare, list, punch, Daily, palette "Jaa sivu"      |
| Act      | Stores                     | `/myymalat`, `/kompassi`, preferred store                     |
| —        | Feeds, data files          | Settings → Tietoa, `<link>` tags, category and product pages  |

The menu (`navGroups` in `utils/app/nav.ts`) already follows this shape: Selaa, Omat, Myymälät,
Työkalut & Pelit. Feeds stay out of navigation, which is right.

## 2. Reusable pieces that already exist

- **State**: `compareProductIds`, `lists`, `watchlist`, `punchDraft` in `global.svelte.ts`, each
  persisted by the layout. Product identity everywhere is the product number string.
- **Action logic**: `utils/user/compare.ts` (toggle, reference-anchored add, max 6),
  `lists.ts` (add, quantity, URI encoding), `punch.ts`, `watchlist.ts`, `app/share.ts`
  (`handleShare`, Web Share API or clipboard).
- **UI**: `ProductPreview` (list row card), `Popup` (dialog), `AddToListContent` + `AllLists`
  (the "Lisää" popup), `CompareBar`, `BottomBar` / `pageBottomBar`, `Toast` / `showToast`
  (anchored, optional link), `PageHeader`, `Badge(List)`, `ProductImage`, `ErrorBoundary`.
- **Command palette**: products, categories, stores, lists, pages and actions; on product pages
  it already offers watch, compare, add to each list, add to punch, similar and alko.fi.

The building blocks are sound. The problems are in how they're wired, not missing features.

## 3. Inconsistencies and disconnected workflows

1. **Compare is implemented five times.** `ProductPreview`, `ProductPricePanel`,
   `ProductMobileCta`, `ProductSimilar` and the palette each wrap `toggleCompare`. Four of them
   show a blocking `alert()` when the comparison is full, with no way to open or clear it. Only
   the similar-products cards set `aria-pressed`; the others don't announce their state.
2. **The "Lisää" popup is wired six times** (`Main`, `List`, `PriceChanges`, `SimilarProducts`,
   `ProductPricePanel`, `ProductMobileCta`), ~18 identical lines each.
3. **Adding to a list gives no feedback.** The popup just closes. Adding to the punch from the same
   popup shows a toast with a link, and the palette shows "Lisätty listaan …".
4. **"Uusi lista" in the add popup creates an empty list.** A first-time user taps Lisää → Uusi
   lista → the new list, three taps, and the product isn't in it until the third.
5. **The palette's page list is a copy of the menu and has drifted**: Skanneri is missing, and
   its links lack the trailing slash the router redirects to.
6. **The scanner is a one-way door.** A hit navigates to the product page and nothing remembers
   it; comparing three bottles at the shelf means scan → Vertaile → back → scan… with no list of
   what was scanned. Not-found and error states are dead ends: no retry, no next step.
7. **Toasts can only say "done"** (always a check icon), so they can't carry a warning such as
   "comparison is full".
8. **Share + "Linkki kopioitu" toast** is repeated in seven places (product, compare, list ×2,
   punch, Daily, palette). Works the same everywhere; just duplicated.
9. **Deleting a list is one tap with no confirm or undo** (`AllLists`), while punch recipes and
   "clear all data" use `confirm()`.
10. **Watchlist rows have no compare / add actions**, unlike every other product row.
11. Empty states vary (bare "Ei tuloksia" on `/`, a card on `/listat`, a centred prose block on
    `/vertailu`). Cosmetic.

Product cards (`ProductPreview`, similar cards, `ProductMiniList`, watchlist rows, compare
headers, compare-bar chips) differ because they serve different densities. Merging them into one
card isn't worth it; sharing the **action buttons** between them is.

## 4. Opportunities

- **A. Shared product actions** (fixes 1–4, 7): `utils/user/productActions.ts` for the
  feedback-bearing versions of compare / add to list / add to punch, plus `CompareButton` and
  `AddToListButton` components used by every surface. Toast gets a `warning` tone.
- **B. One page registry** (fixes 5): nav items carry palette keywords; the palette builds its
  pages from `navItems`, so a new page shows in both or neither.
- **C. Scanner as a discovery loop** (fixes 6): recent scans on the scanner page with compare and
  add buttons, retry / search-by-name on failures, and "Skannaa seuraava" on a product page opened
  by a scan.
- **D. Share helper** (8): `shareWithFeedback({ … }, anchor)` wrapping `handleShare` + toast.
- **E. List delete undo** (9): toast with an "Peru" action instead of a confirm dialog. Needs a
  button (not link) action on toasts.
- **F. Watchlist row actions** (10): `CompareButton` + `AddToListButton` once A exists.
- **G. Menu placement**: Skanneri is a way to find products but sits in "Työkalut & Pelit" with
  the calculator. Phones pin it by default, so this is low impact; only worth doing alongside B.

## 5. Order

1. A — shared product actions (highest reach: every product row and product page).
2. B — palette pages from the menu.
3. C — scanner loop.
4. D, E, F — small follow-ups built on A.
5. G and empty states only if they still look off after the above.

## 6. Risks

- **`feat/i18n` conflicts.** That branch rewrites the strings in every file A touches. Doing A
  first means fewer copies to translate, but the branch will need a rebase with conflicts.
- **Analytics continuity.** Keep `add_to_compare`, `punch_add_product`, `create_list` names and
  payloads. New events (`add_to_list`) start fresh series.
- **Stored data.** No change to the shape of `lists`, `compare_products`, `punch_draft` or
  `watchlist`. Recent scans live in `sessionStorage` under a new key, so nothing old is read.
- **Toasts over dialogs.** The toast isn't in the top layer, so it must be shown after the popup
  closes, anchored to the button that opened it.
- **`page.state` isn't reliable here**: `SearchParamsManager` calls `replaceState(url, {})`,
  which clears it. "Came from the scanner" uses `afterNavigate`'s `from` instead.
- **Virtual lists.** Row components are recreated while scrolling; action components must not hold
  state that matters beyond the global stores.

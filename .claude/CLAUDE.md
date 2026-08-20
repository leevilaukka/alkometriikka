# Alkometriikka project guidance

## Project

Alkometriikka is a Finnish-language browser application for browsing Alko product data. It is a static SvelteKit site deployed to GitHub Pages. The UI provides computational and informational data only; do not describe it as alcohol marketing, sales, or encouragement to drink.

## Stack and commands

- Svelte 5 + SvelteKit 2 + TypeScript.
- Vite and Tailwind CSS 4.
- Bun is used for scripts and data synchronization.
- `npm run dev:no-sync`: start the app without downloading data.
- `npm run dev`: run the sync first, then start Vite.
- `npm run check`: run Svelte/TypeScript checks.
- `npm run lint`: check Prettier formatting.
- `npm run format`: format the repository.
- `npm run build`: build the static site and prerender product pages.
- `npm run preview`: preview a production build.
- `npm run sync`: synchronize product data from Alko APIs.
- `npm run migrate`: run the data migration script when explicitly needed.

Run `npm run check` and `npm run lint` after code changes when practical. Prefer `npm run dev:no-sync` for UI work so development does not unnecessarily call Alko APIs.

## Repository map

- `src/routes/`: SvelteKit routes and application loading.
- `src/lib/`: UI components, domain logic, stores, types, and utilities.
- `src/lib/alko/`: product dataset and filtering domain logic, including `Kaljakori`.
- `src/lib/utils/`: shared utilities such as storage and availability handling.
- `scripts/setup/`: API sync, migration, cleanup, and dataset types/constants.
- `scripts/prerender-products.ts`: generates static product documents after Vite builds.
- `static/`: files copied into the deployed site; `static/data.json` is local/generated data.
- `notes/`: project decisions, migration history, deployment notes, and improvement ideas.
- `build/`: generated output. Do not edit it by hand.

## Data and sync invariants

- `static/data.json` is gitignored on `main`; the deployed dataset lives on `gh-pages`.
- Never replace or delete the existing product baseline casually. The sync intentionally keeps discontinued products and marks them with `meta.removedFromSelection`.
- The new dataset contains `schema`, `metadata`, and `products`. Products are keyed by product ID and contain `values`, optional `priceHistory`, and optional lifecycle metadata.
- `src/routes/+layout.ts` adapts the new on-disk format to the legacy table shape expected by the rest of the UI. Preserve that boundary unless a full consumer migration is intended.
- Change detection hashes only the declared lifecycle fields in `scripts/setup/constants.ts`. The migration and sync paths must hash equivalent normalized representations, or every product will be fetched again.
- Do not commit live price data, availability data, secrets, `.env` files, or generated `build/` output unless the repository workflow explicitly requires it.
- Avoid unnecessary requests to Alko APIs. Use `dev:no-sync` for frontend iteration.

## Code conventions

- Follow existing Svelte 5 syntax and component patterns.
- Keep user-facing copy consistent with the existing Finnish UI.
- Preserve public types and existing data contracts unless the change requires a coordinated migration.
- For local storage, use the typed `LocalStorageManager` APIs in `src/lib/utils/storage.ts`; let `getItem`/`setItem` infer the key-specific type rather than supplying explicit generics.
- Lists use the versioned migration flow: read with `getLists()`, normalize legacy shapes, then write with `setLists()` so `lists_version` is stamped.
- Keep edits focused. Do not reformat unrelated files or modify generated artifacts.
- Prefer structured parsing and typed helpers over ad hoc string manipulation.

## Validation and troubleshooting

1. For a UI change, run `npm run check` and `npm run lint`; use `npm run dev:no-sync` to inspect it.
2. For sync or migration changes, inspect the output format and run the narrowest relevant Bun script only when network/data access is intended.
3. For changes involving dataset loading, verify both a current new-format dataset and the expected empty/error paths.
4. If a check fails in unrelated code, report it separately rather than broadening the change.

## GitHub Pages deployment

`build.yml` builds the static app and restores `data.json` and `sitemap.xml` from `gh-pages` before publishing. `data.yml` refreshes the dataset on a schedule, after builds, or manually. Preserve this separation and do not force a workflow change without checking `notes/deployment.md`.

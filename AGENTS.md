# Agent instructions

This repository is **Alkometriikka**, a Finnish-language static SvelteKit application for browsing Alko product data.

Read [`.claude/CLAUDE.md`](.claude/CLAUDE.md) for the complete project guide. The short version:

- Use Bun for repository scripts; use `npm run dev:no-sync` for frontend iteration.
- Validate changes with `npm run check` and `npm run lint` when practical.
- Do not edit generated `build/` output.
- Treat `static/data.json` as generated/private-on-main data and avoid unnecessary API calls.
- Never delete discontinued products from the dataset; preserve `meta.removedFromSelection`.
- Keep migration and sync hash normalization identical, or change detection will refetch everything.
- Use typed local-storage helpers and preserve the existing Svelte 5 patterns.
- Keep user-facing text consistent with the Finnish UI.

Before changing deployment or data workflows, read [`notes/deployment.md`](notes/deployment.md) and the relevant notes in [`notes/`](notes/).

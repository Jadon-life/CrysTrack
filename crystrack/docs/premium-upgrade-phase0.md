# CrysTrack premium upgrade — Phase 0 safety record

**Development branch:** `feat/crystrack-premium-sep28`

**Frozen source:** `feat/september-28-ui-refinement` at `7c4e1d5` (the approved September 28 layout and eight polished pages).

## Product decisions

- Preserve the September 28 full-screen layout, horizontal glass navigation, backgrounds, adaptive original colours, and practical daily tracking.
- Make History collapsible: month → day → recorded activities, with pagination.
- Keep Calendar compact: small date indicators; hover preview on desktop and click/tap for grouped expandable day details.
- Keep Sunday weekly summary; offer separate on-demand Progress Reviews: 2 weeks, 1, 3, 4, 6 months, 1 year, or a custom date range. Generate only on the user's explicit button press; label saved reviews with their actual dates.
- Offer six editable initial Life Areas (Spirit, Body, Communication, Leadership, Focus, Discipline), Quick Add with confirmation, and configurable Today cards.
- Remove obsolete Focus Timer interface/code; preserve existing user data, including historical database rows and local device storage. Do not introduce a new Focus Timer.
- Do not add a sidebar, floating workspace, search bar, daily planning rituals, time blocks, or mandatory task priorities.

## Verified repository facts

- The starting UI ref's GitHub CI passed tests, types, lint and build.
- Five `src/components/dashboard/` files were found without references from other app source modules: `focus-timer.tsx`, `today-view.tsx`, `right-rail.tsx`, `quick-stats.tsx`, `quick-capture.tsx`. Their stale tests are updated to assert the **active** Today page instead.
- None of the inspected TypeScript/JavaScript/CSS source modules import `framer-motion`, `date-fns`, or the candidate unused Radix packages; do not edit `package-lock.json` manually. Remove packages only in a dependency-aware workflow followed by `npm ci`, checks and build.
- No Focus Timer database records, browser localStorage entries or Supabase tables have been deleted.

## Finance safety hold — MUST resolve before backend integration/release

The separate `fix/september-28-database-compatibility` branch (PR #2, `9040fc9`) is **not merged** into this branch. Its report identifies a historical savings-goal double-credit bug in the September writer, and migration `0012` introduces guarded finance RPCs.

Its disposable PostgreSQL suite, mocked browser checks and build previously passed, **but the actual live Supabase schema/migration history and existing finance records were never verified**. Do not infer deployed schema from GitHub migrations or Vercel success. Do not run financial write tests against the live database or previews that may share its credentials.

Next required step is an authorized read-only schema/migration and ledger assessment, followed by an isolated Supabase staging project with relevant modern migrations and authenticated test data. Run migration prerequisites and compatibility tests there before deciding how to integrate PR #2, with the fail-closed production write rules preserved until intentionally and safely resolved. Do not apply old September migrations or alter live balances. Never silently rewrite historical savings targets.

## Release gate

Keep this development branch isolated from `main` and production. Each change requires green CI and desktop/mobile light/dark review. All new finance paths require a staging-only integration and reconciliation plan. Merging user-visible upgrades into production remains separately approval-gated.

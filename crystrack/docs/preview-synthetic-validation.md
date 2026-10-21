# Issue #11 local validation

Implementation branch: `feat/piece2d-synthetic-preview`.
Base dev head: `d2341bcf5bc3d3a33e61ee0cbf6672134157d3f9`.

Executed on 2026-10-18 from `crystrack/`:

| Check | Result |
|---|---|
| `npm ci --cache /tmp/crystrack-npm-cache` | Passed with the frozen lockfile. Existing dependency deprecation warnings; no version upgrades to application dependencies. |
| `npm run check` | **135 tests passed**, zero failed/skipped; TypeScript passed; lint zero errors and four pre-existing warnings in unchanged background/switch components. |
| `CRYSTRACK_CHROMIUM_PATH=/usr/bin/chromium npm run test:preview` | Passed real Preview build, client artifact scan, local HTTP probes and Chromium network checks. |
| Ordinary `npm run build` | Passed after the Preview test. Fresh Production-mode build used sanitized loopback/synthetic bindings only, never hosted credentials. |
| `git diff --check` | Passed. |
| Workflow YAML parse | Passed; jobs `validate` and `preview-safety`. |

## Exact safety evidence

- Actual compiled `.next/static` assets contained none of five supplied fake
  credential/URL markers, including the known production Supabase hostname, fake
  anonymous/service-role/AI keys, and an additional arbitrary public binding.
  Rendered page HTML was also checked. No real credentials were retrieved.
- Local HTTP probes denied all **38 mutation/callback methods in 34 inventoried
  route files**, including Auth callback GET, cron, push, Telegram, AI, finance,
  notes, profile and avatar endpoints. Unknown routes and live rates were denied.
- Unit tests prove **zero browser/server/admin/session SDK constructions** in
  Preview, before cookies or key access; they also retain normal Production factory
  construction and the original authenticated profile write through synthetic mocks.
- Real Chromium traversed `/`, `/plan`, `/tasks`, `/goals`, `/assignments`,
  `/calendar`, `/finance`, `/insights`, `/history`, `/ai`, `/settings` and `/auth`.
  All were synthetic; Auth exposed no password form.
- Browser transport intercepted and denied every off-origin URL. Recorded **zero
  external requests**, zero socket/beacon traffic, zero geolocation/push/worker
  registration attempts, and zero browser runtime errors. This excludes the live
  Supabase ref and all OpenRouter, Telegram, weather, geocode, rate and push hosts.
- The actual approved appearance switch changed `aria-checked` and back. An avatar
  upload reached the explicit disabled guard. Telegram connection, push setup and
  location controls were exercised without integration/permission calls. Local
  storage remained empty; synthetic changes were not persisted.
- Restarting the real server without the required runtime flag returned **503**
  for pages, APIs, Auth callbacks and static assets. Unit tests also cover missing,
  invalid and mismatched build configuration, and unchanged normal behavior.
- Actual desktop Today and mobile Tasks screenshots were captured and inspected
  locally. Approved scenic composition/navbar remain; only demo disclosure is added.
  Artifacts are ignored under `.preview-test/` and are synthetic, not hosted previews.

A pinned Playwright dev dependency and a separate GitHub Actions job run the same
loopback build/browser proof. That job has no deployment environment or secrets and
performs no Vercel action. The package manager normalized some lockfile platform
metadata while adding Playwright; existing application dependency versions/integrity
pins are unchanged. No new paid service is used (repository is public).

## Scope and unverified items

No schema/migration/seed/RLS changes; no database SQL, real records, storage, hosted
integrations or environment-variable management was accessed. Local DB integration
tests were not rerun for this code-only Preview slice; no database code changed.
Normal Production paths retain their prior clients/writers and authorization; real
hosted Auth/financial writes were deliberately not tested. Financial arithmetic,
ledger behavior, approved styles/navbar/Three.js implementation are unchanged.
Preview-only currency-cache and outbound transport guards do not alter normal finance
behavior.

Vercel Preview Branch Tracking remains OFF per owner confirmation. This local proof
does not independently audit Vercel settings or secure old deployed artifacts. Direct
Vercel management access is unavailable; GitHub deployment/status signals for the
pushed SHA are checked separately in the draft PR/report. No hosted deployment,
variable change, migration, production change or merge is part of this PR.

The exact reversible cutover is [documented separately](preview-synthetic-mode.md).
It needs owner approval, removal of Preview-only hosted bindings, one separately
approved fresh demo build, live network verification, and then separate approval
before automatic Preview deployments can be enabled. Until then, keep them OFF.

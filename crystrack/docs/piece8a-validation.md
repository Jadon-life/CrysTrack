# Issue #43 — prerequisite audit validation

**Release decision: BLOCKED. Offline Today is not implemented or enabled.**
Read [the audit and proposed atomic server prerequisite](piece8a-offline-prerequisite.md).
The issue explicitly requires stopping before a client workaround when a missing
server invariant is found. This is a draft review handoff, not a completed feature.

## Verified starting authority

- Remote development head: `e35a0f36b7813ac913df7a8075281467588d1e72`, verified
  before branching and again during validation.
- Post-merge CI [39425655123](https://github.com/Jadon-life/CrysTrack/actions/runs/39425655123):
  completed SUCCESS for both jobs, matching that exact head.
- New branch: `feat/piece8a-offline-today`; target `feat/crystrack-premium-sep28`.
- No code from later `main` was imported. No application, service worker, public
  asset, script, dependency or migration changed. The 207-file source comparison,
  including all 16 migration hashes, is in
  [source-invariants.json](validation/issue43/source-invariants.json).

## Scope of new evidence

Two characterization tests in `tests/daily-records.integration.mjs` reproduce
archive/delete **after** a valid read and **before** replay: both leave revision 1
unchanged, and the existing online RPC accepts completion at revision 2. Repeating
that request produces the same receipt and only one activity event. These tests
pass because they assert current online behavior; they do **not** assert the
stricter offline requirement is satisfied.

The tests use authenticated synthetic owners and independent committed operations
on the guarded loopback-only PostgreSQL sandbox. No hosted data was read or changed.
No migration candidate was added. Existing 0000–0005 and 0013–0022 candidates were
installed only by the existing guarded disposable-local reset workflow.

## Executed checks

| Check | Result | Evidence |
| --- | --- | --- |
| `npm run check` | **232/232** application tests; TypeScript passed; ESLint 0 errors / four existing warnings | [check](validation/issue43/application-check.log) |
| Focused missing-invariant reproduction | **2/2** characterization cases passed (archive and delete) | [reproduction](validation/issue43/offline-prerequisite.log) |
| `npm run test:preview` | Passed: 12 routes, every inventoried writer denied, zero external browser runtime requests, missing-mode fail-closed | [Preview](validation/issue43/synthetic-preview.log) |
| Maintenance barrier | **55/55** probes denied before auth; auth page remains accessible | [maintenance](validation/issue43/maintenance-probes.log) |
| `npm run build` | Normal optimized production artifact passed locally; not deployed | [build](validation/issue43/production-build.log) |
| Protected-source comparison | **207 files identical**, including all 16 migration files | [hash inventory](validation/issue43/source-invariants.json) |

`npm run test:local:db` passed **141/141** (139 retained plus the two new
characterization cases), zero failures/skips, on the clean disposable sandbox.
[Full database log](validation/issue43/local-database.log). This includes real
Auth/PostgREST owner boundaries, daily outcomes, Crystal Shards, Assignments,
Week Grid, budgets, bills, CSV, exact totals/timezone and trusted AI completion.
All **nine retained signed-in Chromium suites passed** sequentially after the
clean database run: Assignments, Today streak, Crystal Shards, Week Grid, Budgets,
Bills, CSV, Money Presentation and Wealth Overview. Each suite's fresh log and
machine result are under `validation/issue43/retained-*`.
[Exit statuses and durations](validation/issue43/browser-status.json).

The extended AI privacy suite also passed at **375/430/768/1280/1440px**, both
physical themes: **70 scoped axe scans**, zero violations; 29 intercepted model
calls, **zero real provider calls**, no browser errors. Its five synthetic-owner
finance/reward/durable-state hash pairs match before/after; synthetic exact balance
remains NGN 33,749.75. Non-loopback browser attempts (296) were blocked. The suite
retains trusted-server completion, scope/revocation/deletion, missing credentials,
owner switching and backend-key non-disclosure checks.
[Browser evidence](validation/issue43/ai-privacy-browser.json),
[log](validation/issue43/ai-privacy-browser.log).
These are scoped automated accessibility checks, not a full manual certification.

Six actual synthetic Today/streak screenshots from the current retained run are
committed: [index and support limits](screenshots/issue43/README.md).
The full desktop and 375px captures were visually inspected. They show the
**unchanged online UI**, not a purported offline after-state. The other retained
suites' scratch screenshots are regenerated locally; their current JSON/log evidence
is committed without duplicating unrelated prior-feature image collections.

`git diff --check` and the staged-file credential scan passed before commit.
GitHub CI is evaluated on the pushed PR head; its exact run/results and matching
local/remote/PR SHA are reported in the PR and handoff after completion.

## Unsupported / not claimed

No offline queue, local storage consent/clear controls, pending status UI, sync
worker, new receipt route, server guard, offline reload or offline navigation was
implemented. Therefore disconnected/reconnected, uncertain-delivery, reload,
cross-tab, account-switch, revoked-auth, storage-quota and day-rollover **offline
queue** workflows cannot be validated and are explicitly **not passed**. Retained
online tests do not substitute for them. No offline after-state screenshot exists.
Real iOS/Android behavior and manual screen-reader certification are unverified.

An initial maintenance attempt ran before a normal build existed and failed its
artifact setup check without making requests; the rerun used the completed build.
The first full DB attempt used a retained synthetic volume and hit the existing
no-financial-fixtures assertions. A browser runner was also started prematurely;
both were stopped. Those attempts are excluded from pass counts. The disposable
sandbox was reset through the guarded script and DB/browser validation was rerun
strictly sequentially. No product checks or database guards were bypassed.

Issue #18 remains the production release blocker. No hosted migration, Vercel
configuration, Preview activation, deployment, merge or production operation took
place. Stop for independent review of the server prerequisite before implementing
any offline replay.

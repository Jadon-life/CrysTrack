# Issue #29 — local validation evidence

Verified remote development head:
`2594fb68b039746d7d558a2bc9ae7c1a48482b1b`, with green post-merge
[CI 39260462483](https://github.com/Jadon-life/CrysTrack/actions/runs/39260462483).
Branch: `feat/piece6a-monthly-budgets`. No post-September main source was fetched,
copied or imported. See [pre-implementation decisions](piece6a-budgets.md).

## Executed October 19, 2026

- `npm ci --cache /tmp/crystrack-npm-cache`: PASS, 544 packages. No runtime or
  development dependency/lockfile changes. Existing environment/setup reused;
  no new secret, hosted project or paid resource. Node 24.19.0 locally, Node 22
  in existing CI; Playwright 1.57.0 / system Chromium 154 / axe-core 4.10.3.
- Baseline `npm run check`: 169 tests passed before feature edits.
- Final `npm run check`: **173/173**, zero failures/skips; TypeScript PASS;
  ESLint zero errors. Four existing warnings remain in unchanged background
  hook dependencies (2), img optimization (1) and the physical switch's
  aria-description (1). No suppression or weakened assertion.
- `npm run test:local:db`: **84/84**, zero failures/skips: thirteen budget tests
  plus all seventy-one retained local/daily/crystal/assignment/week tests.
  Executed against the guarded loopback Docker stack `crystrack-local-free`,
  PostgreSQL 15.8, synthetic identities/fixtures only. Reset/reseed targeted
  only that disposable stack; no Supabase link/login/hosted bindings.
- DB proofs include exact cents and aggregates above per-entry NUMERIC(12,2),
  **2,001+ rows**, complete owner aggregation, all movement exclusions, null
  flow-kind fallback, actual expected-linked expenses counted once, missing
  category mapping, category edits/reclassification/deletion, leap-year and
  spring/fall DST month instants, saved-zone midnight, bounded historic reads,
  no carry-over/backfill, stale timezone/month/revision conflicts, exact replay,
  concurrent creates/edits, A/B RLS, anonymous/malformed JWT denial, revoked raw
  writes/private reads, table CHECK/unique constraints and invalid-source data
  failing unavailable rather than becoming zero.
- Budget lifecycle snapshots preserved the complete money ledger, savings target,
  debt, expected-flow records, original Wealth/cash-flow forecast outputs,
  Crystal Shards ledger and durable daily records byte-for-byte. Budget reads
  never call daily_context or change task facts. No new reward rule/trigger.
- `npm run test:preview` with local Chromium: PASS across **12 routes**, including
  the new Budgets view with disabled controls; **37 inventoried writer routes**
  blocked (new POST/PATCH/DELETE included), five fake hosted artifact markers
  absent, missing-mode fail-closed, **zero external requests/runtime errors**.
  This is a local synthetic build, not an enabled/deployed Vercel Preview.
- `npm run build`: PASS for the normal optimized artifact. All declared integration
  variables were blanked, then only guarded local Supabase bindings supplied
  privately. Normal build restored after the separate synthetic artifact.
  Local VERCEL_ENV=production selects normal code; it does not deploy anything.
- `CRYSTRACK_CHROMIUM_PATH=/usr/bin/chromium node scripts/test-budgets.mjs`:
  PASS with real local Auth/REST/RPC, signed-in fictional accounts, Lagos saved
  timezone and a New York browser. Create/edit/remove/recreate, precise near/over
  signals, invalid precision, indicative USD toggle/NGN editor, committed-but-lost
  response and exact retry, actual competing edit/409, mass-assignment rejection,
  read failure/recovery, historical read-only view, underlying category edits,
  next-month refresh and owner switching all passed. An October unset-category
  editor left open into November is rejected rather than silently retargeted.
- The browser compares the entire original Wealth response and finance/reward/
  daily rows around budget-only changes. A separate intentional synthetic expense
  through the existing Money entry form succeeds above the limit and refreshes
  the budget aggregate; budgets never gate a legitimate finance transaction.
- Widths **375/430/768/1280/1440**: no document overflow, >=40px controls,
  semantic labelled articles/meters, keyboard modal containment/Escape and focus
  restoration after rereads. Scoped axe WCAG 2 A/AA and 2.1 AA: **zero violations**
  and no remaining ARIA-review flags at each width. Photographic color contrast
  remains an axe manual-review item. Actual computed header colors composited
  over conservative white backing give **11.68:1 title, 10.66:1 body, 4.55:1 enabled
  control**. Header and numeric reading surfaces use the same stronger interior
  backing while retaining the outer scenic glass. This is not whole-app WCAG
  certification. Reduced motion, actual local scenic image and physical theme
  switch/light preference were exercised; screenshots were visually inspected.
- Normal browser outbound weather/location attempts were blocked before transport:
  ten in the final budgets run, **zero runtime errors**. The USD quote was an
  explicitly fictional local test fixture (1600 NGN/USD), never a live FX claim.
- Retained real-browser workflows PASS: `test-assignments.mjs`,
  `test-today-streak.mjs`, `test-crystals.mjs`, `test-week-grid.mjs`. These cover
  reminders/graceful missing delivery config, assignment lifecycle, verified
  streaks, rewards/reversal/levels/settings, original expense flow and retries,
  account isolation, Week Grid, concurrency, keyboard and five-width checks.
- `node scripts/test-task-maintenance.mjs --synthetic-local-only=ISSUE19-NO-HOSTED`:
  **55/55** task/daily/cron method probes returned 503 before auth; auth remains
  accessible. No maintenance, cron or Vercel setting was changed.
- `git diff --check`: PASS. Candidate hash/source inventory verified by DB suite.

Initial checks exposed a decimal validator throwing on malformed input, the
Preview test loader needing relative pure-config imports, fixture cleanup trying
to delete protected synthetic daily identities, missing forwarded card labels,
definition-list markup and transient conflict/focus handling. These were fixed;
immutable history was retained rather than weakening database guards. Screenshot
review strengthened the new header's bright-scene reading surface. Final tests
include the corrected behavior; no failed checks were bypassed.

## Actual screenshots and machine-readable evidence

- [Original default Overview, with synthetic data](screenshots/issue29/overview-before.png)
- [Monthly Budgets desktop](screenshots/issue29/budgets-desktop.png)
- [Light preference / bright scenic photograph](screenshots/issue29/budgets-light-bright.png)
- [375px mobile](screenshots/issue29/mobile.png)
- [Signed-in browser evidence and contrast calculations](screenshots/issue29/browser-evidence.json)
- [Synthetic Preview safety evidence](screenshots/issue29/preview-safety.json)

Screenshots are from actual Chromium, not mockups. Budget test clock is October
19 with an explicit month-boundary transition, and all amounts/names are synthetic.
Default Overview, September palette/scenes, horizontal navigation and Three.js
switch are preserved. No sidebar, recurring bills or CSV/import/export changes.

## Migration inventory and review/release limits

New candidate: `0018_wealth_monthly_budgets.sql`, SHA-256
`fd8cc05eb7b8c2231365f85b3f2c81067ed060cb2d25615f7e554c4c401ab14c`.
**Applied locally only.** Explicit bootstrap inventory: twelve files, 0000–0005
and 0013–0018. All earlier migration files remain unchanged. New Drizzle models/
inferred interfaces and validated DTOs accompany the two new tables/functions.
No old source table, amount, ID, balance, reward trigger or RLS policy is altered.

Targets are current-month-only writes and previous-twelve-month read comparisons.
Limit removal retains an inactive revision tombstone; old request receipts cannot
resurrect it. Creation/update/removal dates make chronology explicit. Saved-zone
changes recalculate month membership on the next read; open editors retain their
original month/zone and must be reviewed after a boundary change. No carried-over
or retroactively invented budgets. Existing legacy capped/Number-based Wealth
summaries remain unchanged and are never used as budget authority.

Hosted schema/history, name/number collisions, backup/recovery and coordinated
rollout remain **UNKNOWN/unverified**. **Issue #18 remains a release blocker.**
No hosted Supabase queries/writes/migrations, Vercel edits, Preview activation,
production deployment, main modification or merge. Live hosted auth, delivery
services and real exchange rates were deliberately not tested. Issues #30/#31
were not implemented. Draft PR and independent review only; no release clearance.

Exact pushed SHA, PR and GitHub CI outcomes are recorded in the draft PR and
delivery report. The disposable stack is stopped after validation; volumes retained.

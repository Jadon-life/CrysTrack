# Issue #30 — local validation evidence

Base: `feat/crystrack-premium-sep28` at
`ee0cc9eb1854c695e2f08394a99726ad5e8182d2`. Verified the exact remote head and
[successful post-merge CI 39273791924](https://github.com/Jadon-life/CrysTrack/actions/runs/39273791924)
before branching. Feature branch: `feat/piece6b-recurring-bills`. No post-September
main source was fetched, imported, cherry-picked or merged. See the
[pre-implementation source/payment/reminder decisions](piece6b-bills.md).

## Executed locally (October 19, 2026)

- `npm ci --cache /tmp/crystrack-npm-cache`: PASS, 544 packages; no new dependency
  or lockfile modification. Local Node 24.19.0, existing CI Node 22, Playwright
  1.57.0, system Chromium 154 and existing axe-core 4.10.3.
- Application check: 177 tests passed, zero failures/skips; TypeScript passed;
  ESLint zero errors. Four pre-existing warnings in unchanged background hooks,
  image optimization and the approved physical switch remain; no suppression.
- Synthetic Preview safety: PASS, all 12 routes, disabled Bills controls,
  38 inventoried writer routes denied, fake hosted artifact markers absent,
  missing-mode fail-closed, zero external requests and browser runtime errors.
  This is a local build/browser run, not a Vercel deployment.
- Maintenance barrier: PASS, 55 task/daily/cron method probes returned 503 before
  authentication, while the ordinary auth page remained accessible.

- `npm run test:local:db`: **96/96** tests passed, zero failures/skips, on a
  fresh local reset with final SQL hashes matching. Includes all 84 prior
  local/daily/crystal/assignment/week/budget tests plus twelve bill cases.
- Bill DB coverage: A/B ownership/RLS/ACL and anonymous/private/direct-DML denial;
  monthly 29–31 clamping, quarter/leap/DST, saved-zone rollover/change; exact
  actual payment versus estimate, one ledger/activity source, original shards
  unchanged; concurrent same/different request IDs and cached replay; injected
  activity failure rolls back money/proof/receipt/permit together; immutable
  ledger provenance and blocked forged bill origin; paid/overdue history through
  edits/pause/resume/terminal cancel; stale/malformed fields/revisions/context;
  mismatched proof becomes not confirmed; **2,001** bill definitions with complete
  exact planned totals and pinned pagination; DND/opt-in/one reminder attempt;
  real local Auth/PostgREST and malformed JWT denial.

- Retained signed-in Chromium regressions PASS: Assignments, Today streaks,
  Crystal Shards, Week Grid and Monthly Budgets. Each ran sequentially against
  synthetic local Auth/REST/RPC; five-width workflows, source security and
  existing financial snapshots remained intact.

- New signed-in Bills Chromium workflow: PASS. Real local Auth/REST/RPC,
  saved Lagos dates with a New York browser; create/edit/pause/resume, required
  payment checkbox and explicit actual amount, lost committed response/exact
  retry and replay, malformed acknowledgement recovery, one actual budget
  expense and zero spending shards, real paid history, second-tab revision
  conflict, terminal cancellation and unavailable reads clearing stale totals.
  Unauthenticated dispatcher calls are denied; missing Push/Telegram bindings
  produced one failed attempt across two authorized local calls, with no false
  reminder success, activity or additional expense.
- Five widths **375, 430, 768, 1280, 1440**: PASS for signed-in Bills, no
  horizontal document overflow, controls at least 40px, keyboard modal focus
  containment/Escape/restoration. Scoped axe checks of both the new Bills region
  and editor passed at every width (zero WCAG 2 A/AA and 2.1 AA violations).
  Photo-backed contrast requires manual review in axe; conservative computed
  header colors composited over white measured **11.68:1** heading, **10.66:1**
  body and **4.56:1** ghost control. Actual desktop/mobile and bright-scene images
  were inspected. This is not a claim of whole-application WCAG conformance;
  unchanged legacy page/header text and the switch retain their existing limits.
- Physical Three.js appearance switch and daylight photograph loaded and worked;
  light and dark preference transitions passed. Normal Bills browser blocked
  five attempted external requests, with zero page/runtime errors. All displayed
  names, money and exchange quotes are synthetic.
- Optimized normal `npm run build`: PASS with all declared integration bindings
  blanked and only guarded loopback Supabase bindings supplied privately.
  `VERCEL_ENV=production` selected the local normal artifact; it did not deploy.
  Synthetic and normal artifacts are validated separately; normal restored for
  handoff. No dependency, global theme, background or navbar implementation change.

Initial failures were corrected, not bypassed: migration parsing/bootstrap state,
strict direct-RPC payment types/revision, a DST fixture carrying the wrong zone,
select accessible names and acknowledgement handling. A fresh local reset reran
all 96 DB cases against final SQL. Browser captures were repeated from document
top so the preserved floating navbar does not obscure section headings.

## Candidate inventory and release limits

Only new migration: `src/db/migrations/0019_wealth_recurring_bills.sql`, applied
**only** to the guarded disposable Docker stack `crystrack-local-free` (loopback
Auth/REST/PostgreSQL 15.8), with synthetic records. Bootstrap inventory: thirteen
files, 0000–0005 and 0013–0019; no legacy migration edited. New public and private
tables enable RLS; authenticated clients receive owner SELECT plus the two
validated RPCs, not direct bill DML/private authority. Reminder RPCs are
service-only. Schema models, inferred types and DTOs are synchronized.

No hosted history, production records, Supabase credentials, Vercel settings or
production authentication were accessed or changed. Hosted compatibility,
migration numbering, backup/recovery and scheduling are **UNKNOWN / blocked by
Issue #18** and require separate release authorization. No deployment, merge,
main change, paid service or Issue #31 work.

Plans are deliberately excluded from existing Overview forecasts, which retain
Expected Money as their sole planned-flow source. Do not track/confirm the same
obligation in both systems. No unsafe automatic match/adoption of legacy expected
flows is attempted. A bill confirmation writes exactly one actual expense;
there is no automatic charge, finance history rewrite or new reward rule.

Reminders use the existing dispatcher, no new cron. They are opt-in, saved-zone,
DND-aware and at-most-one **attempt**, not a promise of exactly-once external
delivery: missing/ambiguous integrations stay unconfirmed without automatic
retry. An already in-flight delivery cannot be recalled by a concurrent payment
or cancellation. Real Push/Telegram delivery is unverified and was not attempted.

Paid facts cannot be edited, deleted or undone here; a genuine refund is recorded
separately through existing Wealth. Canceled definitions are terminal. Synthetic
immutable payment fixtures intentionally remain until the next guarded local
reset; tests never disable security to clean up. Historical recovery is bounded
to 4,096 occurrences per bill, with an explicit unavailable result beyond that
bound. Initial first-due selection is limited to one year either side of saved
today. No claim is made that existing hosted schema supports this candidate.

Final candidate SHA-256: `032edf162a9a8e89f93708510f7b9a647ab9fd6673c69a04b4837d44d205f859`.

Existing Overview's capped/Number-based analytics are retained as approved,
including its 2,000-entry read limit; this piece does not claim to repair that
legacy limitation. New bill and budget totals use complete owner-scoped SQL
NUMERIC aggregates, and per-occurrence source proof does not depend on the
Overview's capped ledger response. The card distinguishes the frozen next-due
estimate from an edited future recurrence estimate.

## Actual screenshots and reproducible evidence

- [Desktop Bills](screenshots/issue30/bills-1440.png)
- [375px Bills](screenshots/issue30/bills-375.png) and [mobile editor](screenshots/issue30/edit-mobile.png)
- [430px](screenshots/issue30/bills-430.png), [768px](screenshots/issue30/bills-768.png), [1280px](screenshots/issue30/bills-1280.png)
- [Light preference / bright photo](screenshots/issue30/bills-light-bright.png)
- [Confirmed actual payment history](screenshots/issue30/payment-confirmed.png)
- [Bills browser evidence](screenshots/issue30/browser-evidence.json), [validation inventory](screenshots/issue30/validation-summary.json)
- [Synthetic Preview evidence](screenshots/issue30/preview-safety.json)
- Retained browser results: [Assignments](screenshots/issue30/assignments-regression.json), [Today](screenshots/issue30/today-streak-regression.json), [Crystals](screenshots/issue30/crystals-regression.json), [Week Grid](screenshots/issue30/week-grid-regression.json), [Budgets](screenshots/issue30/budgets-regression.json).

Reproduce with the guarded local setup: `npm ci`, `npm run local:start`, then
`npm run local:reset` and `npm run test:local:db`; `npm run check`; synthetic
`npm run test:preview` using available local Chromium; build normal with blanked
integration bindings plus `readLocalKeys()` from the guarded local helper. Run
`node scripts/test-{assignments,today-streak,crystals,week-grid,budgets}.mjs`
individually and sequentially, then `node scripts/test-bills.mjs`. In this cloud
workspace set `CRYSTRACK_CHROMIUM_PATH=/usr/bin/chromium`. Do not supply caller
targets, hosted bindings or live credentials. GitHub PR #33 records exact final
commit/run checks; keep it draft and stop for independent review.

Executed command output: [application check](validation/issue30/application-check.log),
[96 local database cases](validation/issue30/local-database.log), [normal build](validation/issue30/normal-build.log),
[synthetic Preview](validation/issue30/synthetic-preview.log), [maintenance barrier](validation/issue30/maintenance.log),
[retained browser runner exits](validation/issue30/browser-regressions.log). These contain test output only;
no environment files, local keys, private command error log or database dump is included.

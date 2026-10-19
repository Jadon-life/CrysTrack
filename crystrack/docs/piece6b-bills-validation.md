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

New Bills browser and final build evidence is being collected; this paragraph
will be replaced with the exact completed results before handoff.

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

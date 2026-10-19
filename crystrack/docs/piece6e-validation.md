# Issue #37 — exact Overview validation and review handoff

Started exclusively from remote development head
`326be53606dddac5fdd192ed4460d6eaaed6821e`. Before branching,
[post-merge CI 39340785211](https://github.com/Jadon-life/CrysTrack/actions/runs/39340785211)
was verified SUCCESS for both jobs. Read Issue #37 and its follow-up. No main
source was fetched/imported. Branch: `feat/piece6e-exact-overview`.
[Draft PR #38](https://github.com/Jadon-life/CrysTrack/pull/38) targets only
`feat/crystrack-premium-sep28` and must remain draft for independent review.

## Scope and semantic proof

[Pre-implementation contract](piece6e-contract.md) records each balance and
forecast formula, source classification, timezone and DTO consumer. Actual
balances preserve the approved signed-flow formulas; targets remain separate from
saved balance, transfers stay neutral, paid bills count once, future bill plans
remain excluded, and expected-flow confirmations suppress only their applicable
saved-local month. No stored financial history or award is changed by a read.
The old pure `wealth.ts` helpers remain only for compatibility/reference tests;
active Overview/Today/AI authorities use the shared complete reader instead.

A single owner-scoped **STABLE** SQL call reads a coherent MVCC snapshot. PostgreSQL
NUMERIC text and BigInt kobo preserve exact actual sums. Only chart coordinates
become Numbers; original exact strings feed tooltips and #35 presentation.
Projection/baseline rounding happens once for serialization, while decision
thresholds compare exact rational operands. Ratios and projections are estimates.

Saved scheduling timezone resolves through the existing 0018 helper. Saved-zone
changes re-bucket existing instants without rewriting history; day, month, prior
month, six-month chart, due debts and expected confirmations share that zone.
Even recent transaction labels use it, rather than the browser's timezone.

Fail closed on unverifiable provenance, malformed money/dates, unsupported future
actual dates, owner/grant errors or response coverage overflow. Unknown is never a
zero balance. Reads are private/no-store. Focus, visibility, daily boundary and
explicit refresh replace stale reports; automatic refresh does not request AI
analysis. AI gets aggregate context and allowed recent dates/kinds/amounts/
categories, never financial descriptions, notes, references, accounts or debt
counterparties. Side previews are explicitly bounded; their aggregate authority
is complete.

## Validation results

Final counts, per-suite results, screenshots and reproducible logs are recorded
under [validation/issue37](validation/issue37/) and
[screenshots/issue37](screenshots/issue37/). `npm run check` passed **211/211** tests (14 new report/context cases), TypeScript
and ESLint (zero errors, four unchanged background-hook/image/physical-switch
warnings). The fresh guarded reset plus full database suite passed **122/122**,
zero failures/skips; 14 new Overview integration cases cover original and CSV
histories beyond 2,005, large exact sums, all flow kinds, protected paid bills,
read immutability, owner/grants/real Auth/forged JWT, historical edits/deletion,
invalid evidence, range overflow and concurrent ledger/debt commits.

The fixed small scenario matches the legacy formulas where they should match.
The controlled cap regression explicitly proves **19.69** from the old 2,000-row
path versus exact **19.75** including six older income cents. Database proof also
sums 2,006 original cents plus a later expense, then 1,000 maximum NUMERIC amounts
without crossing JS Number authority. Lagos midnight and New York DST/month,
leap day, confirmations and due-debt boundaries agree with exact Budgets.

Normal `npm run build` passed after the separately repeated local synthetic
Preview build. Twelve Preview routes and all 40 writer routes passed denial,
client-marker and missing-mode fail-closed checks with zero external requests or
runtime errors. Maintenance rehearsal passed **55/55** denied task/daily/cron
probes before auth; ordinary sign-in remains accessible. Node 24.19 was used
locally; GitHub CI uses the unchanged frozen install under Node 22. Dependencies
and lockfile are unchanged; the existing frozen-install workspace was reused.

Retained Assignments, Today streak, Crystal Shards, Week Grid, Monthly Budgets,
Bills and CSV Chromium runs all passed. Final Overview and retained money-presentation runs **both PASS at
375/430/768/1280/1440px** on the rebuilt normal artifact. Overview exports reopen
with **2,009 rows at every width**, including 2,005 archived CSV-imported cents and
one protected paid bill. Exact balance is `17514.55`; October expense `2505.50`
agrees with saved-zone Budgets. Moving to November/New York leaves the all-time
balance unchanged, gives current expense `0.00` and prior October expense `4.75`;
the Lagos-midnight expense now belongs to September. No financial facts changed.

HTTP 503 and malformed partial DTO probes remove old amounts and status stamps;
Refresh recovers. Today uses the same report. Focus, keyboard dialog trap,
Escape/asynchronous focus restoration, >=40px disclosure, scoped amount/dialog/
report-status axe (zero violations), whole/exact NGN, indicative USD, CSV precision,
bright scene and physical Light/Dark switch are verified. Financial, debt,
savings, budget, bill, CSV provenance and shard snapshots remain unchanged during
read/display/currency/export actions. External attempts are blocked before browser
transport; synthetic Preview makes zero external requests.

**17 actual screenshots** were visually inspected, including corrected saved-zone
labels, exact dialogs, statements, bright Light mode, New York/DST and unavailable
states. The final seven retained domain regressions ran on the unchanged authority;
final date-label/reading-surface polish is additionally covered by the rebuilt
combined Overview workflow and retained money suite. Exact-head GitHub CI and sync
are recorded in the draft PR after the evidence commit is pushed.

## Test corrections and limits

Screenshot review caught the old UTC recent-transaction label after monthly sums
had been corrected; it now uses the report zone and is asserted in a New York
browser against a Lagos October 1 entry. The compact status stamp has an interior
reading surface and is included in scoped axe checks.

The retained money test originally selected two identical amount buttons after
the corrected monthly cashflow equaled available balance. Its selector now scopes
to the Available card; financial expectations were not weakened. The final focus
probe initially asserted before Radix finished asynchronous focus restoration;
it now waits up to five seconds and still requires the same original trigger.
Initial failure logs are retained as synthetic diagnostic evidence.

A few first-pass database fixtures were corrected: immutable awards lack an id
column, saved scheduling zone changes must use trusted local fixture setup, and
identical repeated CSV rows require explicit duplicate acknowledgement. An invalid
zone change is rejected by the existing guard. All source protections stayed on;
the final fresh 122-test suite passed, rather than treating the failed fixtures as
a successful run.

No hosted credentials/test account or external AI model was used. Live AI-provider
connectivity and hosted auth/schema were not tested. Local real Auth/PostgREST,
JWT rejection, signed-in navigation and pure AI-context privacy are covered.
Accessibility evidence is scoped dialog/amount/status and retained bright-scene
checks, not whole-app WCAG certification. Four existing lint warnings are retained;
no unrelated scenic UI or physical switch redesign was attempted.

## Local-only migration inventory and release boundary

Only new candidate: `src/db/migrations/0021_wealth_overview_read.sql`, SHA-256
`01ec3ad4f4ca1b0d509fb34229c2c3b38d8c00e42050151617e798f63ec4b937`.
Applied **only** through the guarded disposable loopback Docker bootstrap, now
fifteen explicit files (0000–0005 and 0013–0021). Adds a private clock and a
read-only authenticated owner RPC; no new tables, data backfill, financial writer,
RLS relaxation, reward mutation or legacy SQL edit. Matching inferred TypeScript
snapshot/report/summary types are exported. Existing 0015/0019/0020 provenance
and all original writer code remain unchanged.

Hosted migration history/numbering, schema compatibility, data quality, performance
at real-owner scale, backup and rollout readiness remain **UNKNOWN**. No hosted
query or financial record was accessed. This candidate depends on the earlier
reviewed local 0018/0019/0020 schema and must not be applied remotely from this PR.
**Issue #18 remains a hard production release blocker.**

Bounds are explicit fail-unavailable gates, not truncation: 12,000 grouped
month/kind/category buckets, 10,000 per side collection, 8 MiB internal / 4 MiB final
response, supported exact magnitudes and year range. There is no 2,000-entry
aggregate cap; only the recent list is limited to 14 and labeled. High-cardinality
or invalid/future legacy data requires independent assessment, never source
rewriting or an invented zero. No hosted rollout is claimed.

All browser data, screenshots, fixtures and export assertions are fictional local
owners. No real statement, credentials, `.env`, database dump or private financial
record belongs in the PR. No Supabase hosted migration, Vercel edit, Preview
activation, deployment, main change, paid resource or merge was performed.

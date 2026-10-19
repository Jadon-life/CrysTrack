# Issue #31 — local validation evidence

Verified remote dev head `a0637c43be62673962437c40f2ddd1649821e2eb` and
[post-merge CI 39290869797](https://github.com/Jadon-life/CrysTrack/actions/runs/39290869797)
before branching from FETCH_HEAD into `feat/piece6c-wealth-csv`. Issue #31 and
both financial provenance/handoff comments were read first. No main source was
fetched/imported. See [decisions and limits](piece6c-csv.md).

## Executed October 19, 2026

- `npm ci --cache /tmp/crystrack-npm-cache`: PASS, 544 packages. No dependency or
  lockfile change. Existing guarded local setup reused; no new secret, service,
  project or paid resource. Local Node 24.19.0, existing CI Node 22; Chromium 154,
  Playwright 1.57.0, axe-core 4.10.3.
- Application tests: **187/187**, zero failures/skips. TypeScript passed. Lint
  zero errors; four pre-existing warnings remain in unchanged background hook
  dependencies/image optimization and the physical switch's aria-description.
- `npm run test:local:db`: **108/108**, zero failures/skips, after a fresh guarded
  reset/reapply with final SQL hashes. All 96 retained tests plus 12 CSV tests,
  PostgreSQL 15.8 on loopback Docker `crystrack-local-free`, synthetic owners only.
- CSV DB proofs: zero financial/source/activity writes during review; owner A/B,
  anonymous/service/private ACL, revoked direct DML; strict fields and exact
  NUMERIC multi-month actuals; one batch/all rows/one generic count-only activity;
  no historical spending shards; unchanged original manual +5; immutable source
  IDs/clearing/edit/delete/reversal/forgery denial; concurrent identical receipts,
  different-batch file-row/reference collisions, changed payload and replay;
  failure rollback of batch/rows/permits/ledger/rewards; stale ledger/timezone/day
  review; case-insensitive scoped refs and legitimate identical acknowledged
  transactions; saved-zone/DST/leap/microseconds/nonexistent local days and future
  rejection; no mutation of old money, paid bills, debts, savings or expected
  flows; complete **2,001+** owner exports, all flow kinds, notes privacy and
  explicit 10,000-entry / long-note / unknown-date bounds; atomic 500 rows and
  rejection of 501. Real local Auth/PostgREST included.
- Parser/input tests cover UTF-8/BOM, actual quoting/newlines/delimiters, resource
  limits, indexed mapping and ignored balance, explicit DMY/MDY, exact grouped
  decimal/debit-credit arithmetic, unsupported FX/precision/exponents/negative
  zero, known currency unmapping, strict envelopes, streamed-body limit, foreign
  origin denial and valid proxied authority, CSV escaping and control/format-
  prefixed spreadsheet formula protection. No raw statement reaches AI.
- Signed-in CSV Chromium passed at **375/430/768/1280/1440**: local Auth/REST/RPC,
  saved Lagos dates with New York browser, choose/map/balance denial, correction,
  categories and exclusion, complete preview and duplicate acknowledgement,
  cancel with zero writes, explicit confirm once, same-file duplicate blocking,
  lost-response exact retry and refresh receipt recovery, no extra shards and
  unchanged existing entries, exact CSV download/reopening, optional notes and
  formula neutralization. The desktop export contained **2,005** rows, not 2,000.
  At 1280px, an imported multiline description survives textarea review and
  export/reopening. Malformed success at 768px stays unconfirmed; exact replay
  recovers the receipt. A >4 MiB CSV at 1440px returns 503 JSON without an
  attachment or export-side writes; the complete 2,005-row download succeeds.
- New dialog and tool surfaces: scoped axe WCAG 2 A/AA + 2.1 AA zero violations
  at five widths, no document/modal horizontal overflow, keyboard containment,
  Escape and focus restoration, >=40px button targets. Actual computed header
  contrast conservatively composited over white: **11.68:1** heading/control,
  **10.66:1** body. Photo-backed contrast was visually reviewed in the captured bright scene; this is not
  whole-app conformance. Preserved legacy headers/switch have existing limits.
- Retained Chromium suites passed: Assignments, Today, Crystal Shards, Week Grid,
  Monthly Budgets and recurring Bills, followed by the final CSV replay.
- Maintenance barrier: **55/55** task/daily/cron method probes denied with 503
  before auth; ordinary authentication page still accessible. No maintenance or
  cron setting changed.
- Local synthetic Preview: PASS across **12 routes**, **40 inventoried writer
  routes** denied plus explicit CSV export GET denial, disabled import/export
  controls, absent fake hosted artifact markers, missing-mode fail-closed, zero
  external requests/runtime errors. A local browser build, not a Vercel Preview
  activation or deployment. Final repeat after fixes passed.
- Normal optimized build passed with all declared integration bindings blanked,
  then only guarded local Supabase bindings supplied privately. The local
  `VERCEL_ENV=production` selects normal code; it does not deploy. The final normal
  artifact was restored after the separate final synthetic build.

Browser testing exposed legitimate defects that were corrected: explicit source
field labelling, Next internal URL versus actual request authority, and a fuzzy
acknowledgement unmounting itself. Consent now stays visible but requires fresh
server proof. Source-currency evidence cannot be hidden through unmapping.
Generated Next types were checked again after sequential artifact builds rather
than accepting a concurrent generation race. No financial guard/assertion was
weakened to obtain a pass.

## Local candidate / release limits

Only new SQL: `0020_wealth_csv_statements.sql`, SHA-256
`5e63dabb2c006c614952226313e154c40bd03745d3f86a42efb40e81f2048014`.
**Applied locally only.** Fourteen explicit bootstrap files, 0000–0005 and
0013–0020; no legacy migration file changed. All new tables RLS-enabled, owner
SELECT plus strictly granted RPCs, private single-use source authority, schema/
inferred interfaces/DTOs synchronized. The approved 0015 function is replaced
additively with only CSV-origin exclusions; 0019 bill protections remain intact.

No actual bank statements, production data, hosted Supabase queries/migrations,
Vercel configuration, Preview activation, production/main changes, merge or paid
resources. Hosted migration history/numbering/compatibility/recovery are
**UNKNOWN; #18 remains a hard release blocker**. No live import/export/integration
claim. Synthetic immutable fixtures remain only in local volumes until guarded
reset; tests never disable guards for cleanup.

Limits: imports are NGN actual income/expense only, 1 MiB / 500 rows; no universal
bank/fintech format promise or FX conversion. References are scoped to a stable
owner/source key; file hashes identify exact bytes, not bank authenticity.
Reference-less reformatted files cannot be proven identical; possible-match
warnings need review and never silently remove legitimate identical entries.
The matcher uses saved day, type, exact amount and case-folded trimmed
source description. Confirmed imports are immutable, no automatic undo/refund;
correct before confirmation. Refresh/review after saved scheduling context changes;
server rejects stale proof. Existing capped/Number-based Overview calculations
are preserved, not claimed repaired. Imports change balances/budgets through the
ordinary actual ledger; old source records and planning/target state stay intact.

Export is complete or fails: <=366 days, <=10,000 entries, notes optional and
<=4,096 UTF-8 bytes, <=8 MiB DB payload / 4 MiB CSV. Undated/invalid history needs
review rather than being treated as zero. ISO timestamps preserve instants; local
calendar bounds use the saved zone. Exports are archives, not new statements to
reimport. Only pending batch UUID/owner key is persisted in sessionStorage; raw
CSV and row data stay in memory and are discarded on closing. No description,
reference, account or raw CSV in activity, toast, URL, application logs or AI.

## Final gallery / handoff

[Five-width screenshots and gallery](screenshots/issue31/README.md),
[machine-readable summary](validation/issue31/summary.json) and
[exact command output / browser evidence](validation/issue31/) are committed
with the implementation. Final-head CI is recorded on
[draft PR #34](https://github.com/Jadon-life/CrysTrack/pull/34); both jobs are
required for review handoff. Local logs contain only synthetic fixtures.

The product-owner whole-naira clarification is respected without broadening this
PR into #35: statement review and CSV retain exact kobo; ordinary Wealth displays
are unchanged. No general display-policy rewrite is claimed.

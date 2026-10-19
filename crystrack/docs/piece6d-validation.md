# Issue #35 — validation evidence

Started exclusively from remote dev `76a0556a70e0365b3063645428893c6978d9c46d`.
Both jobs in [post-merge CI 39300895230](https://github.com/Jadon-life/CrysTrack/actions/runs/39300895230)
were verified SUCCESS before creating `feat/piece6d-whole-naira`. Issue #35 and
both follow-up comments were read. No main source fetched/imported.

## Results

- Frozen install `npm ci --cache /tmp/crystrack-npm-cache`: PASS; lockfile and
  dependencies unchanged. Existing guarded Docker sandbox reused. No new
  configuration, secret, service, project or paid resource was needed.
- `npm run check`: **197/197** application tests, zero failures/skips; TypeScript
  PASS, ESLint zero errors/four unchanged warnings in background hook/image and
  physical switch accessibility. Ten new policy tests exercise exact zero,
  negative/large amounts, actual kobo, rounding boundaries, USD indications,
  Nigerian grouping/screen-reader text, invalid inputs and editable precision.
- `npm run build`: PASS. Synthetic local Preview build ran separately first;
  normal optimized artifact restored afterward. No deployment.
- Local synthetic Preview: PASS across 12 routes/40 writer routes, credential
  markers absent, missing-mode fail-closed, zero external requests/runtime errors.
- Fresh guarded disposable-local reset + full database integration: **108/108**,
  zero failures/skips. All retained owner/RLS, exact numeric budgets/bills,
  immutable CSV origins, no historical import shards, atomic retry/rollback,
  debt/savings/expected-flow and >2,000-row export regressions passed.
- New signed-in money-presentation Chromium: **375/430/768/1280/1440px**. Actual
  local Auth/PostgREST and protected CSV fixture, whole income/savings/bill/cap
  labels, exact fractional ledger/debt/budget decisions, visibly marked summary
  with inspectable exact amount, keyboard trap/Escape/focus restore, >=40px
  disclosure, scoped label/dialog axe zero violations, native input precision,
  canonical NGN / indicative USD, zero financial/provenance/reward mutations.
  Fictional CSV review keeps `2500.25` and `5000.00`; downloads reopen with
  `2500.75` and `25000.00` unchanged. Both physical switch states verified.
- Retained signed-in Chromium: **Assignments, Today streak, Crystal Shards,
  Week Grid, Monthly Budgets, Bills and CSV all PASS**. New CSV-independent
  browser safety blocks external calls; Preview makes zero external requests.
  CSV regression again proves a complete **2,005-row** export and explicit
  oversized-response failure, no truncation, retry/refresh and no extra shards.
- Maintenance probe repeat: **55/55** denied with 503 before auth; auth still 200.
  Only a local server-process flag was used, no configuration/environment edits.
- **15 actual synthetic screenshots** show everyday/statement screens at five
  widths, exact dialogs, budgets, bills and Light mode on a bright scene. Images
  were visually reviewed. New dialogs have solid reading surfaces; retained
  budget/bill bright-scene computed contrast includes **4.55:1** controls.
  This is scoped validation, not a whole-app WCAG conformance claim.

An initial TS check caught bigint-literal syntax unsupported by the repository's
configured target; using `BigInt(...)` resolved it. A proposed formatter import
into the standalone financial module was removed after its integration loader
exposed that dependency. The financial module is now byte-for-byte unchanged;
the full database suite is rerun from a fresh guarded local reset. A maintenance
probe attempted during reset was refused by the existing container-identity guard;
the repeated probe passed after the dedicated stack was ready. No guard was bypassed.

The native controlled number input initially treated its current value as a step
base, so the new browser test exposed a three-decimal value passing HTML validity.
A fixed `min="0.01"` now aligns that field with its unchanged positive-amount rule
and two-decimal step; all five widths prove valid whole/kobo and invalid sub-kobo
input. Retained Crystal/Budget scripts now locate it by its accessible label rather
than the retired `0` placeholder. Whole-limit display/prefill assertions were
updated; all financial/source/replay/award assertions remain intact. The new theme
probe was corrected to respect the effective adaptive initial state, without
changing the physical switch.

## Financial / release boundary

**No migration, schema, API, financial-core arithmetic, SQL 0013–0020, provenance,
RLS, bill-payment, rewards or security changes.** Existing local bootstrap is
reused solely with synthetic owners. Hosted schema/backup/compatibility remains
UNKNOWN; #18 still blocks production. No hosted Supabase operation, Vercel change,
Preview activation, deployment, paid resource, main modification or merge.

Whole amounts omit `.00` only in everyday presentation. Genuine kobo stays visible
in decision/transaction views and exact in CSV. Summary approximations offer
exact-value disclosure and warn that displayed approximations may not add up.
Existing Number-based aggregate precision and legacy accessibility limits remain
outside scope; the numeric bridge explicitly marks sub-kobo drift/invalid values.
Observed pre-existing boundary: unchanged Overview/chart code groups months by
host/browser JS Date, so a Lagos October 1 midnight CSV record can land in a
September Overview bucket while saved-zone budgets/export correctly use October.
Overall balance and ledger amount remain intact. This is documented for separate
financial/timezone review and not hidden or changed by formatting. See
[policy](piece6d-money-presentation.md).

## Handoff

Draft [PR #36](https://github.com/Jadon-life/CrysTrack/pull/36) targets only
`feat/crystrack-premium-sep28`. [Screenshot gallery](screenshots/issue35/README.md),
[exact successful command logs and browser results](validation/issue35/) and
[machine-readable summary](validation/issue35/summary.json) are committed with the
implementation. Final-head CI and SHA equality are recorded on the draft PR after
push; no live deployment or hosted integration is claimed.

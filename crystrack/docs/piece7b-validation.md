# Issue #41 / PR #42 — security re-review validation

The independent review at comment 6288493686 correctly identified that owner checks
were not sufficient provider-result provenance. This rerun validates the trusted
backend correction, not just the earlier owner/revision-only implementation.

Approved development base: `4df6584eb12f9a9fedaa428f43db5b6fdca7630d`.
Re-reviewed starting PR head: `262fc042b752ea06b6edd7c3ff9885be14257088`.
Same branch `feat/piece7b-explicit-ai-consent`, draft PR #42 into
`feat/crystrack-premium-sep28`. No post-September main code was used.

## Trust-boundary correction

Issuance/check/completion RPCs are service-role only, with a SQL caller-role guard
and exact owner/request/domain/revision binding. The protected Next server verifies
the owner with `auth.getUser()` and rechecks it before completion. The owner is never
copied from client JSON or model output. No cookie/anon fallback exists. Direct
non-null embedded Goal result writes are denied too. Owner consent/deletion/history
stay authenticated and owner-scoped. Existing lock/revision/expiry/rate semantics
are retained. See [security correction](piece7b-security-rereview.md).

Goal check-in copy and prompts now describe only numeric percentages, timing,
check-in counts and durations. The exact goal, raw targets, units and private
reflections remain excluded; qualitative evidence is not evaluated by implication.
The original interface, allowlist, finance and reward behavior are preserved.

## Executed validation

| Check | Result | Evidence |
| --- | --- | --- |
| `npm run check` | **232/232** tests; TypeScript passed; ESLint **0 errors**, four existing warnings | `validation/issue41/application-check.log` |
| `npm run test:local:db` | **139/139**, including all 122 retained + 17 privacy tests | `validation/issue41/local-database.log` |
| `npm run build` | Normal optimized artifact passed locally; no deployment | `validation/issue41/production-build.log` |
| Credential-free Preview | 12 routes, 41 writer files, zero external runtime requests, missing-mode fail-closed | `validation/issue41/synthetic-preview.log` |
| Maintenance barrier | **55/55** method probes denied before auth; auth accessible | `validation/issue41/maintenance-probes.log` |
| Protected source | Protected financial math/APIs, task logic, navbar/theme and legacy SQL unchanged; original schema prefix and six Wealth write handlers identical | `validation/issue41/source-invariants.json` |

The 21 focused privacy application tests (included in 232) cover every provider
path, permission and scope, input/rate/error minimization, missing backend
credentials, trusted-client owner binding and session-owner recheck. A focused
assertion prevents the Goal copy/prompt from again claiming excluded evidence.

The 17 privacy DB tests (included in 139) use guarded local PostgreSQL and real
Auth/PostgREST. A consented authenticated owner cannot issue/check/finish any of
nine domains, even when given a valid backend-created permit. Old overloads and
direct AI table/embedded Goal DML cannot forge results. Backend completion succeeds;
owner/domain/revision mismatches do not consume/rebind the permit. Existing
revocation/ABA/concurrency/expiry/history/deletion tests now use trusted completion,
so a trivial permission denial cannot masquerade as the tested race protection.
Source finance/reward/durable hashes remain unchanged.

## Browser and accessibility rerun

All **nine retained signed-in Chromium suites passed** again: Assignments, Today
streak, Crystal Shards, Week Grid, Monthly Budgets, Recurring Bills, CSV, Money
Presentation and Wealth Overview. Each ran against the revised normal artifact
and guarded disposable Auth/RLS. Their successful outputs and current timings
are in `validation/issue41/retained-*`.

The extended privacy suite passed **375/430/768/1280/1440px**, each in both physical
themes against the scenic environment, reduced motion, browser timezone New York
and saved scheduling timezone Lagos. Actual Next routes use trusted backend RPCs;
only the external model HTTP is intercepted. It exercised all provider adapters,
OFF/no-write behavior, optional Wealth scope, actual payload review, old archive
non-disclosure, cross-tab in-flight revocation, clear confirmation and owner switch.
The added Goal form checks show the numeric-only explanation without saving a
source check-in. Separate processes prove missing model and missing backend
credentials fail closed, including the model-key-present/backend-key-absent case.

- **70 scoped axe scans**, zero violations; conservative reading contrast minimum
  **11.37:1**. Enabled privacy controls meet 40px targets;
  keyboard disclosure/modal, Escape, focus restoration and status were exercised.
- **29 intercepted model calls, zero real provider calls**, no browser errors.
  **296 non-loopback browser attempts** were blocked. Other server
  external destinations are rejected by the guarded test transport.
- All five owner-pair finance/reward/durable/source hashes match before and after.
  Synthetic exact available balance remains **NGN 33,749.75**. Legitimate source
  check-in/reward actions are confined to a separate synthetic action-test owner.
- **39 built client assets** were checked: zero occurrences of the generated local
  backend credential. Browser headers/bodies also assert no backend key exposure.
  The trusted module is additionally protected by Next's `server-only` boundary.
- **106 actual screenshots**, including new Goal and missing-backend captures:
  [screenshot index](screenshots/issue41/README.md). Machine assertions are in
  `validation/issue41/ai-privacy-browser.json`.

## Migration and source inventory

Only the explicitly reviewed **unmerged local-only candidate 0022** was revised.
Its SHA256 is `6f1ab2d3a6f9dc3a6fe324fcf04a2bb30997115a979ceb3237dcf6faf014cdc3`. All legacy 0000–0021 migrations are
unchanged. No table columns changed; existing row interfaces remain synchronized.
The internal server lease now includes verified owner and protected backend client.
A guarded synthetic-local reset installed the revised candidate before the full
139-test suite. Startup initially refused the changed candidate checksum as
intended; no checksum guard was bypassed and no hosted database was contacted.
An initial new-test helper-name typo was corrected before the focused and complete
passing reruns; no assertion or security guard was removed.

The source-invariant report proves no protected finance/task/navigation/theme
changes, original schema-prefix identity, and all six Wealth writer functions
identical to the approved development base. Financial provenance/RLS and existing
reward guards were not modified.

## Independent review and limits

All source, candidate SQL, tests, synthetic screenshots and sanitized evidence are
committed/pushed to the existing draft PR. Exact local/remote/PR/CI head equality,
clean-tree and both completed CI jobs are verified and posted on PR #42 after the
evidence commit; no self-referential commit hash is embedded in this file.

No hosted Supabase, Vercel configuration, Preview activation, production/main,
deployment or merge action was performed. Real provider availability/retention,
hosted migration compatibility and hosted backend-key presence/validity remain
unverified. A valid existing server-only backend credential is a prerequisite to
any separately approved rollout; absence fails closed, never restores authenticated
completion. Already transmitted bytes cannot be recalled; in-flight abort is best
effort and stale persistence remains transactionally blocked. Provider-side deletion
is not promised. Four pre-existing lint warnings remain. Scoped accessibility
checks are not a full manual screen-reader/cross-browser certification.

**Issue #18 remains a hard production release blocker. Keep PR #42 DRAFT and stop
for independent re-review.**

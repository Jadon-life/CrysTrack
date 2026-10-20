# Issue #46 — Piece 8A-P1 validation

Server prerequisite only; [protocol, threat boundaries and migration review](piece8ap1-atomic-replay.md).
Approved starting remote head `251e2c7677e59a334da26c485e7ac2e610cdfac7`, verified
with both completed SUCCESS jobs in CI **39484070500** before creating
`feat/piece8ap1-atomic-replay`. Target: `feat/crystrack-premium-sep28`.

## Implemented and verified locally

| Check | Result | Evidence |
| --- | --- | --- |
| `npm run check` | **242/242** application tests, including ten new contract/security cases; TypeScript passed; ESLint 0 errors / four existing warnings | [check](validation/issue46/application-check.log) |
| `npm run test:local:db` | **163/163** (141 retained + 22 new), no skips/failures | [database](validation/issue46/local-database.log) |
| Separate release-barrier rehearsal | **9/9**, retained SQL/REST classifications, drain/reversal, denied task mutations and legitimate financial positive controls | [rehearsal](validation/issue46/release-rehearsal.log) |
| Maintenance HTTP | **65/65** methods denied before Auth; includes all 55 prior probes plus both new endpoints | [maintenance](validation/issue46/maintenance-probes.log) |
| Credential-free Preview | 12 routes, every inventoried POST/write/callback denied, zero external runtime requests, no registration/transport, missing mode fail-closed; inventory now 43 route files | [Preview](validation/issue46/synthetic-preview.log) |
| Protected existing source | **191 files identical** to approved base, including original daily/online tests, all prior runtime/financial/UI/worker/release source and 16 historical migrations; installed legacy outcome body unchanged | [hash inventory](validation/issue46/source-invariants.json) |

The new DB cases verify full intent/mode binding against legacy and new receipts,
archive/delete/inactive/reactivation and definition/schedule changes, row/context/
snapshot staleness, incomplete/legacy/installation evidence, zone changes, DST
closure, failure rollback, duplicate delivery, explicit owner/anon/forged JWT grants,
private helper denial, exact +5 task and +50 closed-day rewards, and direct release
freeze. Existing online archival/deletion characterization tests are unchanged.
Both concurrent serialization orders for archive **and** hard delete use held SQL
transactions, `HELD` pipe acknowledgment and observed `pg_blocking_pids`, not sleeps.
The parent KEY SHARE/owner lock ordering is exercised by real PostgreSQL locks.
Read-only resolution is tested inside `BEGIN READ ONLY` across a pending transition
and expired day, with source/receipt/reward digests unchanged. Another case hashes
existing financial, AI, goal and assignment tables globally around successful and
rejected writes, including a synthetic exact `1234.75` income record.

The final normal optimized production build passed locally (not deployed):
[build log](validation/issue46/production-build.log).

The application cases verify strict immutable input, actual streaming bounds,
invalid UTF-8/JSON/types, absent/revoked Auth, a 401 between Auth and PostgREST,
minimal validated results, sanitized failures and cross-site denial. No account ID,
reward amount, label, note or private response is accepted in the intent.

## Signed-in browser and accessibility evidence

The new server-guard HTTP/Chromium harness passed **375/430/768/1280/1440px**, both
physical themes. It exercises actual Next handlers, Auth cookies, PostgREST and the
local SQL guard: acknowledged skip → undo → complete, exact retries, changed-payload
409, invalid owner field 400, cross-site 403, archive/new-intent 409, original receipt
manual review, missing receipt, another owner and anonymous 401. Original snapshot
IDs/context remain valid across independent task outcomes, while per-routine
expected revisions must match. Canonical totals are 5 per actually completed task;
no closed-day award is invented. No overflow, browser errors or external browser
traffic is allowed (non-loopback attempts are blocked).

[Ten actual screenshots](screenshots/issue46/README.md),
[server-guard machine results](validation/issue46/server-guard-browser.json),
[log](validation/issue46/server-guard-browser.log).
They show unchanged Today UI after verified server writes, not an offline feature.

All **nine retained signed-in Chromium suites passed**: Assignments, Today
streak, Crystal Shards, Week Grid, Budgets, Bills, CSV, Money Presentation and
Wealth Overview. Each fresh `retained-*.json` / `.log` is committed under
`validation/issue46`. [Batch exit codes/timings](validation/issue46/browser-status.json).

The extended AI privacy suite passed all five widths and both physical themes:
**70 scoped axe scans / zero violations**, 29 intercepted model calls, zero real
provider calls, zero browser errors. All five synthetic-owner financial/reward/
durable/source digest pairs match, exact NGN balance remains `33749.75`, and 296
non-loopback browser attempts were blocked. Trusted completion, consent scope,
revocation, deletion and missing credentials remain covered.
[Privacy results](validation/issue46/ai-privacy-browser.json),
[log](validation/issue46/ai-privacy-browser.log).

After the targeted mid-request Auth-401 response correction, application/TypeScript/
lint were rerun (242/242), and the current normal artifact/dedicated guard harness
passed the fresh build and dedicated five-width/two-theme rerun. Retained
interfaces and code paths are identical to the tested baseline; no unrelated
old-feature source changed.

## Migration inventory and test setup

`0023_offline_outcome_guard.sql` was unused at the approved head. It is the sole new
candidate; existing 0000–0005 and 0013–0022 hashes are unchanged. It adds functions
only, with no tables/columns/policies or schema row-interface changes. New Zod-derived
TypeScript intent/result interfaces synchronize the RPC contract. Internal functions
are private; public entries are authenticated-only with fixed search paths and
owner inference. No service-role fallback or new environment keys exist. The candidate SHA256 is
`66cf69111e8c38bdfb8db5b014d3a0fc7654e81d84efcbf446c4c228ff428574`.

The candidate was applied **only** through the existing guarded loopback Docker
bootstrap/reset. An explicit local reset installed its final checksum before the
full 163-test run. The local runner hashes 17 candidates; this is not hosted history.
No hosted project, environment variable, private data or migration was inspected or
changed. Normal builds use blanked configuration plus guarded local bindings only;
Preview uses its existing credential-free synthetic environment.

The first new browser attempt stopped before login because its test locator used
unassociated existing form labels. The harness was corrected to use the same input
selectors as retained suites; the sign-in page was not changed. Only the successful
rerun is counted. The existing form-label limitation is not a new UI fix/claim.
The initial focused 20-case DB run passed before additional ACL/domain assertions;
its log is retained separately, and the final full suite includes all 22 new cases.
The final handler also maps a PostgREST 401 after successful Auth to 401, and its
current unit/build/dedicated-browser checks are rerun after that targeted change.

## Limits and release gate

No offline queue/UI, IndexedDB activation, pending count, background sync, service
worker change, private caching, offline navigation or safe reload was built. No
browser disconnection/reconnection/reload-sync is claimed. Those are #43 follow-up
work after independent review of this prerequisite. #44 is untouched.
Real iOS/Android, manual assistive-technology certification, hosted compatibility
and deployment are unverified. Automated accessibility is scoped to retained
surfaces; this is not an application-wide WCAG certification. Existing lint warnings
remain unchanged. Receipt `confirmed` is not current-source verification when
`reconciliation=manual-review`; a later client must never auto-rebase or mint rewards.

Issue #18 remains the hard production release blocker. No merge, main import,
hosted SQL, Vercel change, Preview activation or deployment occurred. Keep draft
and stop for independent review; #43 must remain open.

Before commit, the intended-file credential/path scan and staged diff check passed.
Final PR/CI head equality and GitHub job outcomes are recorded in the PR handoff.

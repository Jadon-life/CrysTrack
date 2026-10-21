# Issue #53 — API ingress stop (development preparation only)

Parent: [Issue #18](https://github.com/Jadon-life/CrysTrack/issues/18). This narrowly scoped guard is not a release authorization. No hosted Supabase, Vercel configuration, database, secrets, application deployment, Preview or `main` change is part of this PR.

## What is implemented

The server-only `CRYSTRACK_RELEASE_API_STOP` variable defaults to **`off`** in `.env.example`. Absent, empty, or exactly `off` leaves the application unchanged. Any other nonempty value (including typos and `OFF`) fails closed.

When enabled **on a particular new Next.js application artifact**, `src/proxy.ts` first runs the existing synthetic Preview isolation, then calls `releaseApiStop` **before** the task-only maintenance gate, session refresh, or asset bypass.

- Every method to **`/api` or `/api/*`** receives a JSON **503**, `Retry-After: 60` and `Cache-Control: private, no-store`. Blocking GET/HEAD intentionally includes endpoints that appear read-only but trigger snapshot/recovery or other database side effects.
- Every **non-GET/HEAD page or asset request** also returns 503, including potential Next.js page server actions and form posts; ordinary HTML/static/navigation GET and HEAD remain available.
- All finance, wealth, task, reminder, AI, auth-callback and integration API routes in this artifact use the same fail-closed rule. Some signed-in pages will have unavailable data while the stop is active; that is an expected maintenance limitation, not a read-only user experience.
- The previous `CRYSTRACK_TASK_WRITE_MAINTENANCE` behavior is unchanged. Neither setting installs SQL or mutates a database. The full stop is **not** configured on any hosted deployment by this PR.

## Limitations: NOT production-wide isolation

This app-layer gate can only reject requests **arriving after activation at the particular artifact that contains and honors it**. A new environment flag cannot retrofit **older immutable deployment URLs**, stale application artifacts, older tabs pointing to such URLs, raw Supabase PostgREST/RPC calls, service-role/direct database access, external cron invokers or long-running workers. It cannot revoke messages already sent/reserved, cancel in-flight handlers already past the gate, make separate finance HTTP transactions atomic, protect data/DDL during the 0013–0024 migration sequence, or prevent direct external provider side effects. PostgreSQL managed event hooks/role/ACL behavior remains unverified.

This is **one layer only**. It does not close the P0 gap identified in [Issue #18 independent audit](https://github.com/Jadon-life/CrysTrack/issues/18#issuecomment-6309071888) or supersede the task-only local SQL prototype. **Never apply that existing prototype unchanged to managed PG17.** Ordinary green CI cannot prove a complete release freeze.

## Validation / stop conditions

`tests/release-api-stop.test.mjs` exercises default-off and typo-enabled states; API GET, HEAD, OPTIONS, POST, PUT, PATCH, DELETE requests, including finance/budgets/bills/CSV, daily records, tasks, cron, AI, auth; server-action/form writes on normal page URLs; preserve GET/HEAD page navigation; stable status/headers; and middleware ordering relative to Preview, task maintenance, session and asset checks.

Required independent evidence before calling this slice complete: exact-head GitHub Actions `validate` (tests, TypeScript, lint, build) and synthetic Chromium Preview boundary success. This PR does **not** run production requests or local database rehearsal.

**Still required before any hosted migration or deployment** (each requiring separate owner authorization):
1. Obtain actual artifact/alias, old immutable URL, client, direct PostgREST/service-role and worker inventory; verify all inbound and outbound channels can be isolated.
2. Independently design/test a managed-event-trigger-compatible **task AND finance** database/direct-RPC/old-client/worker write barrier, plus requests/drain and outbound send halt. Test safe rollback/failure modes with synthetic task, bill, ledger, CSV, shards and AI records. Fail closed on unknown ingress.
3. Owner-held full database backup and independently proven private restoration, managed PG17 catalog+data/migration preflight, known-good prior artifact and exact SQL hashes.
4. Distinct explicit approvals for maintenance, hosted SQL 0013–0024, managed postflight, exact normal-mode artifact, controlled owner smoke, and restoring traffic/cron. Keep Preview disabled absent separate approval.

**Decision: Issue #18 remains OPEN; hosted release remains BLOCKED.**
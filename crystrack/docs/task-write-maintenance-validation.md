# Issue #19 validation evidence — 18 October 2026

## Independent-review correction — current validation

The review at `6570d3b4ef5b1edd8f9b17cb8412af42657112a5` identified that
`type='task_completed'` with `entity_type='finance'` escaped the shared activity
row guard. A new authenticated SQL regression reproduced this against the
original guard (expected failure, exit 1: the insert was accepted).

The release-only guard now examines both OLD and NEW task activity types
(`task_completed`, `task_missed`, `task_skipped`) even when the entity label is
financial. It also recognizes `gamification_events.action_key` beginning `task:`
even when kind is `expense`. Original task entity/kind checks remain intact.
Only these table-specific classifications changed; grants, RLS, role/target
checks, trigger behavior, operator controls, hosted preflight, migrations, finance
writers, authentication and approved UI remain unchanged.

The current full local release rehearsal passes **9/9 scenarios**, 0 failures or
skips, in **121.45 seconds**. It includes **48 strict negative SQL/HTTP mutation
probes**: 32 authenticated activity probes and 16 service-role award probes.
INSERT, UPDATE into a task classification (NEW), UPDATE out of an existing task
classification (OLD), DELETE, and conflicting entity/type/kind/action-key labels
all require PT503 / HTTP 503, not incidental RLS errors. Fixture task-labeled
rows are seeded before freeze so OLD checks exercise real matching rows.
Protected data digests remain unchanged after denied probes.

Positive controls execute **12 successful financial mutations** during freeze:
SQL and HTTP INSERT/UPDATE/DELETE of genuine finance activity and expense awards,
with returned rows checked. An `expense:task:...` key is allowed: the namespace
check is a literal `task:` prefix, not a broad substring match. Fixture permissions
are not loosened to obtain passing results. All older rehearsal scenarios pass,
including exact 0013 → 0014, migration fault rollback, held requests, reversal,
post-unfreeze HTTP409, notes, timezone and recovery.

Current additional completed runs (all exit 0):

- `npm ci --cache /tmp/crystrack-npm-cache`: 544 packages; unchanged lockfile.
- `npm run local:start`, clean `npm run local:reset`, then
  `npm run test:local:db`: **31/31**, no failures or skips (45.80s).
- `npm run check`: **141/141**, TypeScript passed, ESLint 0 errors / the same
  4 existing warnings.
- `CRYSTRACK_CHROMIUM_PATH=/usr/bin/chromium npm run test:preview`: all 12 routes,
  all 38 method denials, 5 fake markers absent; no external requests, persistence
  or runtime errors, and missing mode fails closed.
- Ordinary `npm run build` repeated after Preview using sanitized local-only
  bindings: passed, runtime normal; 38 client assets scanned clean.
- `node scripts/test-task-maintenance.mjs --synthetic-local-only=ISSUE19-NO-HOSTED`:
  all **50** method probes denied before auth, ordinary auth page still 200.
- `git diff --check`: passed. Rehearsal database/container removed; no release
  control was installed in the normal sandbox. GitHub CI is recorded in the
  PR follow-up after the focused commit is pushed.

The negative/positive test groups are committed in the existing explicit
`tests/task-release-barrier.integration.mjs` suite, with the same required
`CRYSTRACK_RELEASE_REHEARSAL=ISSUE19-SYNTHETIC-ONLY` confirmation. No release
controls are automatically installed by ordinary tests/build/CI.

The owner's review reports **six existing Supabase-managed hosted event triggers**.
The local preflight still rejects other event triggers; it was not relaxed or
adapted for PG17/hosted use. Production remains BLOCKED by that independent
adaptation/review, backup proof, Vercel 403, old-client/worker isolation, smoke
access and separate owner approval. No hosted SQL or Vercel action occurred.

## Original draft snapshot (6570d3b)

Scope: synthetic loopback Docker only. Base
`e66d6cebbae3edf6c38ed2e3e85ac8e4bd96f297`; old-main handlers pinned to
`cccdb56edb14463030a9ce9b2aed8fbcd07579a3`, not certified as the live artifact.

Toolchain: Node **24.19.0**, npm **11.9.0**, PostgreSQL **15.8**, Chromium
**154.0.8037.57** (Debian 13), existing local Supabase project
`crystrack-local-free`. Hosted PG17.6 was not queried or exercised.

| Command / proof | Completed result |
|---|---|
| `npm ci --cache /tmp/crystrack-npm-cache` | Exit 0; 544 packages; unchanged lockfile |
| `npm run local:start` then `npm run local:reset` | Exit 0; normal synthetic sandbox only |
| `npm run test:local:db` | Exit 0; **31 passed**, 0 failed/skipped |
| `npm run check` | Exit 0; **141 passed**, 0 failed/skipped; TypeScript passed; lint 0 errors / 4 existing warnings |
| `CRYSTRACK_RELEASE_REHEARSAL=ISSUE19-SYNTHETIC-ONLY node --test tests/task-release-barrier.integration.mjs` | Exit 0; **6 passed**, 0 failed/skipped; 92.47 seconds |
| `CRYSTRACK_CHROMIUM_PATH=/usr/bin/chromium npm run test:preview` | Exit 0; 12 routes, 38 denied API methods in 34 route files, 5 fake markers absent, no external requests/persistence/runtime errors, missing mode fails closed |
| Ordinary `npm run build` after Preview, using sanitized local-only bindings | Exit 0; final runtime `normal`; 38 client assets scanned, no hosted project URL, local service-role secret or Preview test markers |
| `node scripts/test-task-maintenance.mjs --synthetic-local-only=ISSUE19-NO-HOSTED` | Exit 0; **50** task/daily/dispatch method probes return 503 + Retry-After/no-store before auth; `/auth` remains 200 |
| `git diff --check` | Exit 0 |

The four existing lint warnings are two hook dependencies and `<img>` optimization
in `environment-background.tsx`, plus `aria-description` on the physical switch.
Install warnings: deprecated `@esbuild-kit/esm-loader@2.6.5`,
`@esbuild-kit/core-utils@3.3.2`, `recharts@2.15.4`, `eslint@9.39.5`. Builds emitted no
build warnings. No dependencies, lockfile, UI, physical-switch, finance or auth
implementation changed.

## Executed release denial / recovery matrix

1. Held task UPDATE and held SELECT transactions prevent enable from succeeding
   within its bounded lock timeout. All partial control/trigger installation rolls
   back. A stale repeatable-read transaction and HTTP request held after task read
   cannot write after successful enable. Prior committed writes remain intact.
2. Repeated enable/disable, overlapping enable processes, a new-process check,
   abort-without-unfreeze and subsequent re-enable preserve a verifiable state.
3. Authenticated and service-role legacy task/schedule/occurrence INSERT/UPDATE/
   DELETE fail. Operator TRUNCATE, replication-role changes and parent auth-user
   cascade cannot evade the gate. Optional rhythm table and delivery writes fail.
4. Five pinned old route handlers run behind a synthetic local HTTP adapter:
   create, toggle, skip, archive and delete all fail promptly (legacy handlers map
   DB errors to HTTP 500; direct REST returns PT503/503). A service-role SECURITY
   DEFINER missed-occurrence writer also fails. No actual old deployment is called.
5. Actual 0013 test string with a deliberately injected pre-COMMIT error rolls
   back its schema, tables, profile column and attached guards while preserving the
   original freeze. Reviewed files on disk are never edited. Exact unmodified
   0013 then 0014 install once in the separate fresh rehearsal database; the event
   hook protects new tables before either file completes.
6. All seven daily tables remain RLS-enabled/frozen; context, outcome, creation,
   retirement, note, timezone, window and service recovery mutations are denied.
   Checks compare profile/task/rhythm/daily evidence/receipt/note, reminder,
   activity, gamification and finance data digests. Non-task finance activity is
   allowed (test transaction rolled back); no ledger records are created/read.
7. Wrong database, marker, schema, ownership and altered function security or
   trigger state stop control actions. API roles cannot invoke private controls.
   Unit tests also reject wrong REST container/project/network/image and hosted or
   query-overridden database URIs before any container is started.
8. Disable preserves non-release triggers/ACLs/RLS and every captured row. New
   complete/retry/stale PT409/undo/skip, note save/conflict/clear, retirement,
   timezone and service recovery work again. First capture day stays incomplete.
   Old authenticated direct occurrence writes remain revoked/guarded after 0013.

The full SQL/HTTP rehearsal uses a **separate marked database** built from template0,
minimal synthetic Auth/Storage prerequisites and unchanged 0000–0005. Its cached
local REST container is pinned by immutable image ID and fixed local DB host; port
54329 binds only to loopback. It never double-installs 0013 in the normal bootstrap.
Test cleanup removes only its newly created marked database/container. The normal
sandbox private clock is restored; no release controls are installed there.
The gamification test uses an explicitly synthetic AFTER-award sentinel, not a
claim to reproduce every hosted trigger or extension.

Unchanged migration SHA-256:

- 0013: `23e1066ba1a8f506cba35901dd3c6794321b9b8531c45154ae4dbdac82aba5d1`
- 0014: `533e37e0a4371928462f9110f63ee5d3da91411696036b6ef066f4e5006ffa5d`

## Decision and owner gates

**Locally proven candidate; production release remains BLOCKED.** No DB smoke
identity bypass is present: mutating smoke waits until DB unfreeze under separately
verified all-client/API/worker isolation. If that isolation cannot be established,
stop before unfreeze; do not expose ordinary users to perform smoke.

The DB gate cannot retract outbound sends or make already committed phases of a
legacy multi-REST request atomic. Such requests must be drained by a separately
proven ingress/application barrier; this was not certified for production.

Remaining: independent review; Vercel 403 resolution and exact alias/artifact/cron/
old-URL inventory; secure restorable backup; PG17/event-trigger privileges and full
hosted schema/trigger review; all-client smoke isolation; fresh preflight; explicit
owner approval for any live freeze, migrations, cutover and recovery. Preview
settings remain independently unverified and were not changed. GitHub CI and
post-push deployment metadata are recorded in the PR / Issues #19 and #18.

No hosted SQL/rows, real backups/dumps, Vercel edits, Preview enablement,
deployment, main merge, finance change, paid resource or APP-Dev reuse occurred.

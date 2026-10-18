# Issue #19 — task-write freeze, local release rehearsal only

Base: `feat/crystrack-premium-sep28` at
`e66d6cebbae3edf6c38ed2e3e85ac8e4bd96f297`. Known old-main source:
`cccdb56edb14463030a9ce9b2aed8fbcd07579a3`. Main is **not proof of the
currently aliased Production artifact**. Vercel `crystrackbeta` project details,
deployments, aliases, cron and Preview settings remain independently **UNKNOWN**
because the connection returns team-scope 403. Do not certify a live writer inventory.

## Writer inventory and risk matrix

| Surface | Known old source | Merged development | Freeze / outstanding risk |
|---|---|---|---|
| Task create | POST `/api/tasks`: separate routine + schedule requests, cleanup on failure | atomic `daily_create_routine` | statement guard on definitions/schedules; no partial create |
| Completion/pending undo/skip | occurrence read-then-write in old toggle/skip routes; separate activity write | `daily_set_outcome`: revision + requestId, receipt + compatibility + activity in transaction | statement guard before any row trigger; PT503; no receipt or award |
| Retire/archive/delete | update/delete routine then reminder/activity cleanup; FK cascades | `daily_retire_routine`, preserves today's frozen plan | definitions guard; selective task reminder/activity guards; parent cascades fail atomically |
| Old tabs / direct REST / SECURITY DEFINER | direct authenticated DML, reusable JWTs, existing public RPCs | direct definitions still possible; occurrence DML revoked by 0013 | no user/version/role allowlist; statement triggers also fire inside SECURITY DEFINER |
| Daily context / task GET / window GET | absent | reads can initialize tracking, recover/close days, snapshot schedules, update stable zone | all seven daily tables frozen; a read-context RPC can return 503; no fabricated missed history |
| Daily notes / timezone | absent | note tombstones/revisions; explicit transition RPC; profile guard | daily tables frozen, including notes and transitions; independent note GET may remain readable |
| Reminder worker | service-role legacy missed-occurrence insert, activity event, reserve delivery, push/Telegram, delivery update | `recover_daily_records`, then same notification pipeline | occurrence/daily/queue guards; **DB cannot retract or prevent a send already reserved in memory** |
| Reminder definitions / activity / awards | shared tables, task + other entities | shared tables, atomic task side effects | task rows guarded in reminders/activity/gamification; unrelated finance activity allowed; all delivery queue writes paused |
| Known October main rhythm RPCs | `save_task_timebox`, `remove_task_timebox`, `save_daily_ritual`, `control_task_focus`; timebox/focus/ritual tables | not part of September dev branch | optional guards if these tables exist; no October migrations imported; unknown live RPCs require owner inventory |
| Trigger chain | occurrence AFTER `gamification_task`; touch timestamps; FK cascades | daily BEFORE/AFTER definition capture, occurrence guard, frozen facts, deferred completeness checks | original definitions/ACL/RLS retained; local synthetic AFTER-award sentinel proves denied writes cannot reach it; exact hosted trigger parity remains an owner gate |
| AI / Telegram / other integrations | main may contain additional preview action handlers; webhook links Telegram | current AI provides context/advice; webhook links identity, not task outcomes | underlying table barriers still apply; external messages are not a DB transaction; inventory every actual artifact/provider before cutover |
| Finance / auth | existing independent writers/session implementation | unchanged | no ledger/function edits or financial grants changed; account-deletion cascades touching tasks are blocked during freeze |

Source inspection: task routes, `src/lib/daily-records-server.ts`, 0013/0014,
`api/reminders/dispatch`, `api/history`, `api/insights`, AI context, Telegram webhook;
old main task handlers, reminder dispatcher, 0008 rhythm SQL and 0010 gamification
SQL. This is a source inventory, not evidence that all those artifacts are live.

## Database design

`release/task-write-barrier/` is **not a migration**. Nothing in npm build, CI,
normal local bootstrap, 0013/0014 or deployment installs it. The manual driver
accepts only a fixed local Docker container and the separately created
`crystrack_release_rehearsal` database, with a private synthetic marker. It rejects
URLs, database/project/Docker overrides and a linked CLI. No hosted variant is
provided. Privileged operators remain trusted; this does not defend against a DB
administrator deliberately dropping guards or changing function bodies.

Enable is one transaction, with an operator advisory lock, 2-second lock timeout
and 15-second statement timeout. The manual attach explicitly takes ACCESS EXCLUSIVE table locks and drains
prior readers/writers; lock failure rolls back *all* new control objects/guards.
Concurrent operators serialize or stop on state mismatch; they do not partly
unfreeze. Legitimate writes committed before enable succeeds are retained.

A database table lock drains database transactions, **not an entire legacy app
request made of multiple REST transactions**. For example, a routine insert may
commit before enable while its later schedule insert is denied; an old handler
may ignore a later activity error. The gate cannot retroactively make those
pre-enable commits atomic or prove that all old tabs are drained. The independent
all-artifact ingress/request/worker quiescence prerequisite is mandatory, not an
optional improvement. If cross-cutpoint legacy flows cannot be ruled out, STOP
and keep production BLOCKED; do not claim the DB gate alone prevents every
pre-existing partial flow. Local denial snapshots start after successful enable.

Unconditional `ENABLE ALWAYS` BEFORE STATEMENT triggers reject INSERT, UPDATE,
DELETE and TRUNCATE on the three legacy task tables, seven daily tables, delivery
queue, and optional timebox/focus/ritual tables. No statement guard consults a
mutable flag, user ID, custom GUC, JWT allowlist or effective role. A stale
repeatable-read snapshot therefore cannot see an old 'off' value and bypass it.
Pure SELECTs, cached idempotent results, validation/conflict errors and no-op
recovery can still return without writes; the database gate promises mutation
denial, not a universal 503 on every RPC. The independent API flag rejects its
listed surfaces unconditionally. RLS bypass is not trigger bypass. Service-role, SECURITY DEFINER and even operator
DML fail. COPY/MERGE/upsert use the same underlying write triggers; untested forms
are not claimed as separate executed probes. DDL-capable operators must not DROP,
replace, disable or TRUNCATE around the gate; API roles must not own these objects.

Task-only ROW guards cover both OLD and NEW classifications in shared activity,
reminder and gamification tables. Any `entity_type='task'` or `kind='task'` retains
its existing protection. On `activity_events`, `type` values `task_completed`,
`task_missed` and `task_skipped` also identify task events even if `entity_type`
is mislabeled `finance`. On `gamification_events`, an `action_key` beginning
with `task:` also identifies a task award even if `kind` is mislabeled `expense`.
INSERT checks NEW, DELETE checks OLD, and UPDATE checks both; relabeling a task
row cannot launder it out of the freeze. True `finance_entry`/`finance` activity
and `expense` awards whose action keys do not begin `task:` remain writable.
Those tables also get unconditional TRUNCATE guards. These are additional gate
triggers, not replacements for existing triggers. Non-task finance activity is
not suppressed. Outbound reminders of **all entities** are paused via the queue
and independent worker shutoff, rather than silently discarded.

An explicitly installed `ddl_command_end / CREATE TABLE` event hook adds guards to
new named daily tables in their own CREATE transaction, closing the 0013 → 0014
and app-cutover gap. It does not fire recursively on ALTER/CREATE TRIGGER. Failed
DDL rolls back newly attached guards with the table. Disable verifies function
bodies, all guard identities/types/ALWAYS states, event hook, private grants and
complete daily-schema phase, then drops only the release triggers/hook. It changes
no application grants, RLS, daily guards or stored facts. Private inert control
objects remain for explicit re-enable/check; no customer data is deleted.

Preflight rejects wrong identity, legacy column/type fingerprint drift, missing
legacy RLS/tables, partial daily schemas, privileged API ownership, unknown event
triggers and unexpected BEFORE STATEMENT triggers. This intentionally conservative
local policy is **not a certification of hosted metadata**. Hosted event-trigger
permissions/extension hooks, PG17 behavior, DDL locks and any extra writer surfaces
need separate review; do not loosen it ad hoc on production. The owner's
independent PR #20 review reports six existing Supabase-managed event triggers
in hosted PG17. The local preflight still rejects other event triggers: it has
not been weakened or adapted for hosted installation.

## Manual local commands

Start/reset the ordinary synthetic sandbox and run its existing tests first.
Never run resets or clock-mutating suites concurrently on the same database.
The separate rehearsal test creates its own fresh database from template0, builds
minimal synthetic Auth/Storage prerequisites, applies unchanged 0000–0005 **only
there**, then freezes and applies exact 0013 followed by 0014 once. It uses the
cached local PostgREST image on loopback port 54329 and real local signed JWTs.
It does not dump, clone or reset the normal sandbox or any hosted database.
Minimal prerequisites and an AFTER-award sentinel are explicitly test fixtures,
not a replica of all hosted extensions/auth/gamification. Legacy HTTP tests use
pinned old route handlers behind a local HTTP adapter with a verified synthetic
actor; their actual REST writes carry local JWTs. No old deployment is contacted.

```sh
npm ci
npm run local:start
npm run local:reset
npm run test:local:db
CRYSTRACK_RELEASE_REHEARSAL=ISSUE19-SYNTHETIC-ONLY node --test tests/task-release-barrier.integration.mjs
```

The test deletes **only its newly created marked rehearsal database** and owned
REST container after completion. Existing same-name databases are never silently
reset/reused. After an interrupted test inspect the surviving local state before
using explicit `destroy`; no automatic retry clears the freeze.

For individual manual experiments (do not run alongside the suite):

```sh
node scripts/task-release-barrier.mjs prepare --synthetic-local-only=ISSUE19-NO-HOSTED
node scripts/task-release-barrier.mjs preflight --synthetic-local-only=ISSUE19-NO-HOSTED
node scripts/task-release-barrier.mjs enable --synthetic-local-only=ISSUE19-NO-HOSTED
node scripts/task-release-barrier.mjs check --synthetic-local-only=ISSUE19-NO-HOSTED
node scripts/task-release-barrier.mjs abort --synthetic-local-only=ISSUE19-NO-HOSTED
# abort verifies and LEAVES the current state intact; it never unfreezes.
node scripts/task-release-barrier.mjs disable --synthetic-local-only=ISSUE19-NO-HOSTED
node scripts/task-release-barrier.mjs destroy --synthetic-local-only=ISSUE19-NO-HOSTED
```

## No smoke bypass: revised cutover gate

No identity can mutate protected tasks while DB freeze is active. Operator
impersonation, a special header, custom GUC or service-role bypass would undermine
old-client protection and is deliberately absent. Metadata/read-only tests can run
while frozen. Mutating smoke must wait until **DB unfreeze**, with an independent
all-artifact application/worker/REST-ingress isolation barrier still holding every
ordinary user out; only an owner-controlled synthetic smoke session can reach the
new artifact. New 0013 occurrence ACL/guard continues to deny old direct occurrence
writers after release, but it does **not** freeze old routine-definition writers.

If the owner cannot prove isolation of ALL old URLs/tabs/direct REST/service-role
workers while the DB barrier is removed, **STOP: pre-opening smoke is impossible
and production release remains BLOCKED**. Local success does not establish that
operational isolation. Do not open ordinary users merely to perform smoke. A new
reviewed DB smoke-identity mechanism would require a separate design/security
review, not a role/GUC shortcut in this gate.

## Independent API / cron / outbound procedure (NOT EXECUTED live)

1. Owner inventories exact production alias, every still-writable immutable URL,
   scheduled invoker, worker, API token/provider and already reserved delivery.
   Vercel 403 means this gate is NOT DONE. Confirm secure private restorable backup
   and known-good artifact; never copy backups/real rows into this task.
2. In a later separately authorized operation stop all cron/invokers and drain
   running requests/queued send jobs. Block old deployment ingress and direct
   service-role invocation at the actual controllable boundary. Already delivered
   external messages cannot be rolled back. Do not revoke shared production
   credentials casually; identify effects and get approval first.
3. Reviewed new artifact can set server-only
   `CRYSTRACK_TASK_WRITE_MAINTENANCE=on`. Absent/empty/`off` is inert; an unknown
   non-empty value fails closed for task, daily and dispatch paths. Proxy returns
   503 + Retry-After + no-store *before auth, DB clients or dispatch*. Preview's
   stronger existing boundary runs first. Auth, finance and approved UI are not
   changed. **This flag cannot change an immutable old artifact** and is not a DB
   barrier or proof of stopped outbound traffic. No deployed variable is edited here.
4. Verify no new delivery claims/sends and no in-flight task requests at every
   actual boundary, then separately approved DB enable; bounded lock failure is a
   STOP, not permission to kill arbitrary sessions. Snapshot metadata/counts after
   enable; do not discard pre-enable committed user events.
5. Repeat #13/#18 catalog and aggregate preflight, including event-trigger/operator
   permissions. Only separate owner approval permits exact 0013 → 0014 and artifact
   cutover. Keep the DB barrier active through both files; compare daily RLS/ACL,
   occurrence guard, retained gamification trigger, function bodies and finance
   metadata. Any mismatch: hold isolation/freeze; no grant workaround.
6. Establish the independently verified smoke isolation described above before DB
   disable. Run complete/retry/stale HTTP409/undo/skip, notes, retirement, timezone,
   bounded service recovery; first capture day is incomplete, no invented history.
   Failure: re-enable DB gate, retain API/worker isolation and evidence; prefer a
   reviewed forward fix. App rollback alone never undoes SQL/occurrence grants.
7. Only after successful owner review remove API/ingress isolation, then restore
   cron and observe delivery/recovery backlog. Re-enter both barriers on anomalies.
   Do not backfill false streaks across capture gaps. Rolling back daily guards or
   old permissions needs its own reviewed data-preserving plan; disable here only
   removes release-specific guards.

**Production remains BLOCKED** by Vercel scope/alias/worker unknowns, backup proof,
PG17/event-trigger/operator validation, all-client smoke isolation, exact owner
migration/artifact approvals and hosted postflight. No live action is authorized.
Preview stays disabled. No finance logic, approved UI, paid resources or APP-Dev
reuse are part of this work.

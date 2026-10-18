# Piece 2C: durable daily records and atomic outcomes

This draft implements Issue #10 on the approved September 28 development branch.
It is validated only against the dedicated local Docker Supabase project, using
synthetic identities. It does not make shared Vercel Preview safe. Keep Preview
Branch Tracking off. No hosted migration, deployment, merge or finance change is
part of this PR.

## Authority and capture

`daily_tracking_states` activates an owner's capture ledger lazily on the first
context/task-definition operation. It saves the existing profile `timezone` (or a
previous explicit `scheduling_timezone`, otherwise UTC). `current_timezone` remains
location metadata, not scheduling authority. Invalid saved zones fail closed.

The activation day is **incomplete**, even if its initial schedule looks complete:
a mid-day installation cannot prove that earlier definitions/occurrences were
captured. Trustworthy capture begins the next local date. Older absent days remain
unknown. Existing history is not backfilled as verified.

`routine_schedule_versions` retains durable routine UUIDs, metadata and weekday
rules with inclusive start-date and exclusive end-date bounds interpreted in the
saved day zone. Definition/schedule triggers first materialize the current set,
then append a next-day version. Multiple edits on one day resolve by the latest
version. Empty schedules are disabled for eligibility, not fabricated successes.

`daily_records` owns one frozen day header; `daily_routine_records` owns exactly one
explicit outcome per eligible routine. Neither history table points at the live
routine definition. Verified-empty days are explicit. Legacy duplicate occurrences
mark evidence incomplete and reject mutation, rather than choosing or deleting a
row. Deferred completeness checks reject verified partial assemblies.

## Atomic desired-state API

The existing POST toggle/skip route names and occurrence-shaped response remain.
The small compatibility adapter now requires:

```json
{"desiredStatus":"completed","expectedRevision":1,"requestId":"<UUID>"}
```

Owner comes exclusively from the authenticated session; date/routine come from the
validated path. An empty `{}` request returns 400 (refresh the client); guessing a
toggle on the server would preserve the retry bug. The existing Today/Tasks buttons
send explicit intent, loaded revision and a new UUID per user action. Retransmission
of an intent must reuse the original body/UUID. Undo is another explicit intent.
No new daily streak values, controls, layout, palette or switch changes are added.

`daily_set_outcome` takes a transaction-scoped owner advisory lock (stronger than
an owner/day lock), checks cached request identity, freezes/locks the day and checks
its midnight deadline and routine revision. A reused UUID with different payload
or stale revision returns 409. A matching receipt replays its original result even
after midnight or subsequent undo, without reapplying it. Desired `missed` is not
accepted from clients. A transaction writes the durable outcome, compatibility
occurrence, authoritative activity row and request receipt together. Rollback
includes every write. Direct authenticated occurrence writes are revoked; legacy
service-role occurrence writes are guarded too. No finance RPC/grant is changed.

## Closure and recovery

Each saved zone defines SQL local-midnight boundaries, including 23/25-hour DST
days. Mutations reject elapsed days even if the worker was offline. Service-role
`recover_daily_records(owner, limit)` catches up in bounded batches (1–366 dates),
from an explicit cursor, and closes only elapsed days. It uses historical versions,
not today's live task list. On **verified** days only, pending outcomes become
missed. Skipped/completed stay unchanged; incomplete days never invent misses.
Repeated recovery is idempotent. Authenticated context requests also recover up to
31 elapsed dates under the same lock; a larger backlog is caught up in bounded
batches rather than producing provisional success. The existing reminder dispatcher calls recovery
each run instead of relying on a ten-minute-after-midnight window.

## Explicit timezone boundaries

PUT `/api/daily-records/timezone` accepts a zone and expected state revision. It
records the old day/zone, new zone, first eligible new date and effective instant.
The old day remains authoritative until its original midnight. A westward move
waits until the next unique date's new-zone midnight; during the gap, context and
outcome writes return conflict. An eastward move may skip a calendar key; missing
keys remain unknown. If the first new-zone date already started, that day is
incomplete. No closed date is reopened, duplicated or reinterpreted. The SQL
transition journal and monotonic first date avoid double credit; device/location
profile updates do not trigger transitions. There is no new timezone UI in this
slice.

## Reading, pagination and Piece 2A

`daily_read_window` returns scalar JSON pages (max 31 headers) with **all** children
for each header, bypassing PostgREST's relationship row cap. The server pins a data
revision across pages, rejects changed context/revisions, invalid cursor ordering,
duplicate days and malformed rows. `assembleDailySnapshots` asserts verified only
for an exact unique routine/outcome set with no legacy conflict and a closed past
day. Missing days are absent, never filled in as success. The server endpoint emits
snapshots, not a new UI streak number. Local tests feed these through the existing
unchanged Piece 2A engine with `historyFromBeginning:false`, preserving unknown
current streak and partial best/lower-bound semantics.

GET `/api/tasks` uses frozen current-day definitions/outcomes, including today's
archived/deleted eligible routines; next-day versions take effect tomorrow. Its
old per-routine streak stays a legacy metric, not a durable full-day streak.
Its existing bounded legacy occurrence query is **not** used as verified daily
evidence. Consumers must not reinterpret it as an authoritative lifetime count.

## Private notes

GET/PUT `/api/daily-notes/[date]` derives owner from the session and disables shared
caching. Missing notes have revision 0. PUT requires matching expected revision;
blank/space-only text saves an empty body, retaining the increasing revision to
prevent stale re-creation. Both Zod and SQL enforce 4,000 Unicode code points. Notes
are separate from activities, mutation receipts, AI context and telemetry; error
logs include operation/code only, never bodies or raw database outputs. No notes
UI is introduced.

## Deliberate refinements from the Issue #7 proposal

- Approved midnight, frozen-day and explicit-zone policies are now selected;
  coarse owner locking also serializes definition edits and timezone changes.
- Capture starts with an incomplete activation day; no unverifiable legacy backfill.
- DELETE task API becomes future retirement, retaining compatibility rows/activity
  and today's eligibility. Confirmation copy explains retention. Direct hard deletion
  still cannot erase durable history. If the parent has physically disappeared,
  an outcome updates durable history/activity without resurrecting it or inserting
  an invalid compatibility FK row. This is an intentional compatibility exception.
- The request cache stores outcome intents/results only, never note bodies. Notes
  use independent revisions and keep blank tombstones.
- The former local draft schema is retained as a separate historical contract
  experiment; 0013 creates the actual public contract. Extra tracking/transition
  tables are necessary to make capture boundaries and timezone decisions auditable.
- No Streak Shield, new daily streak UI, remote installer or finance integration.

## Validation and release blockers

Reproduce: `npm run local:install`, `npm run local:start`, `npm run test:local:db`,
`npm run check`, `npm run build`, `git diff --check`. Use `local:prepare-vfs` only
where the existing vfs setup requires it. `local:reset` resets **synthetic local**
data only. The runner hashes 0000–0005 and 0013 separately from hosted bookkeeping.
Tests temporarily replace the **private** clock function in the local database,
restore it afterwards, and never ship an authenticated clock override. Run the DB
suite serially on a disposable sandbox; an interrupted test requires local reset.

Before hosted use: obtain separately authorized read-only schema/grant/trigger and
migration-history evidence, resolve number/prerequisite compatibility, validate the
actual modern trigger combination in an isolated environment, verify backup and
recovery, review data retention/deletion policy, and approve hosted installation.
No live schema or production data has been inspected here. Modern gamification
triggers, hosted worker permissions/configuration and existing-user compatibility
remain unverified. Stop the legacy writer before applying occurrence write guards;
deploy migration and compatible client/server as a reviewed coordinated release.
Do not mix old toggling clients with the new contract.

Recovery should stop writers and disable the new app path; do not drop the durable
tables or replay legacy migrations as a rollback. Keep captured evidence and request
receipts. Any hosted rollback/DDL requires separate review and authorization.

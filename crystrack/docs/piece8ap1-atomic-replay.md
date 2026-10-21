# Issue #46 — atomic offline Today server prerequisite

This is **server-only Piece 8A-P1**, based on September development merge
`251e2c7677e59a334da26c485e7ac2e610cdfac7`. Exact-head post-merge CI
[39484070500](https://github.com/Jadon-life/CrysTrack/actions/runs/39484070500)
completed SUCCESS for both jobs before branching. The entire issue and independent
[PR #45 review](https://github.com/Jadon-life/CrysTrack/pull/45#issuecomment-6299490850)
were read. No later `main` code was imported.

No queue, IndexedDB consent/storage, offline UI/reload, background sync, service
worker, private response cache or financial behavior is added. Issue #43 remains
open for a separate implementation/review after this prerequisite is approved.
The existing online frozen-Today archive/delete behavior is deliberately retained.

## API and immutable source contract

Authenticated same-origin JSON POST endpoints:

- `/api/tasks/offline/replay` → `daily_replay_offline_outcome(p_intent jsonb)`.
- `/api/tasks/offline/receipt` → `daily_resolve_offline_outcome(p_intent jsonb)`.
  POST avoids putting metadata in URLs/caches; this RPC is **read-only SQL** and
  can execute in a PostgreSQL `READ ONLY` transaction. It does not call daily
  context, recovery, materialization, outcome or reward mutation functions.

Every response is `Cache-Control: private, no-store`. `getUser()` verifies the
current owner on each HTTP request. Authentication errors, including a cached
user accompanied by an Auth error, fail with 401. No owner field is accepted.
SQL independently requires authenticated role and non-null `auth.uid()`.
Service-role and anonymous execution are denied, even with a supplied subject.
No privileged backend credential is needed by these endpoints.

Strict Zod input and SQL validation accept exactly this typed envelope, limited
to **2,048 actual streamed bytes** (not merely declared Content-Length):

```json
{
  "mode": "offline-v1",
  "requestId": "<stable UUID>",
  "day": "YYYY-MM-DD",
  "timezone": "<saved scheduling timezone; at most 100 characters>",
  "contextRevision": 1,
  "snapshotId": "<daily_records.id UUID>",
  "snapshotVersion": "<daily_routine_records.schedule_version_id UUID>",
  "definitionVersion": "<latest routine_schedule_versions.id UUID>",
  "routineId": "<routine UUID>",
  "expectedRevision": 1,
  "desiredStatus": "completed"
}
```

Status is `pending`, `completed` or `skipped`; revisions are positive PostgreSQL
integers. Impossible dates, malformed IDs/types, extra owner/reward/private fields,
invalid UTF-8/JSON and oversized input are rejected. HTTP UUIDs normalize to
lowercase before the canonical intent is sent to SQL. SQL also enforces its own
strict keys/types/date/zone/size rules against direct RPC callers.

`snapshotId` identifies the frozen day; `snapshotVersion` binds the target's
immutable frozen schedule version, independently of the latest definition version.
`expectedRevision` binds its mutable outcome. A mutable **global** daily header/data
revision is intentionally not used as an outcome precondition: another routine's
legitimate completion must not invalidate every independent intent. Saved context
revision still detects scheduling transitions. Source tokens must come from current
owner-authorized server records, never client clock/labels or an unverified UI.
Minimal snapshot acquisition and device consent belong to the later #43 client
work; existing owner-only daily/version SELECT grants are not expanded here.

## Atomic ordering and eligibility

1. Validate identity and envelope. If this owner/request receipt already exists,
   take the owner lock and resolve that exact envelope before touching eligibility.
2. For a new attempt, take a matching owned parent routine `KEY SHARE` row lock
   **before** the owner advisory lock. Absence is not accepted/rejected here; this
   is lock ordering, not an eligibility preflight. A DELETE locks the parent row
   before its BEFORE trigger takes the owner lock. Matching that order prevents
   a replay-owner-lock → compatibility-FK / delete-parent-row → owner-lock cycle.
   Non-key definition updates remain compatible with KEY SHARE and serialize at
   the owner lock. Tests observe actual database blocking, not guessed delays.
3. Take existing `crystrack_daily.lock_owner(auth.uid())` and recheck receipts for
   concurrent duplicate delivery. This is the exact lock used by definition and
   schedule BEFORE triggers (through daily context), closure and online outcomes.
4. In this transaction, verify authoritative local day/timezone/context revision,
   frozen snapshot/target version and outcome revision, current owned/present/
   active/nonarchived definition and latest enabled version, no legacy conflicts,
   complete verified day and open, unexpired saved-zone boundaries. Count every
   frozen child; there is no paginated/truncated eligibility approximation.
5. Delegate to **unchanged** `daily_set_outcome`, with its reentrant owner lock,
   compatibility/activity/reward logic and one owner/request receipt. Enrich that
   same newly created receipt's payload with the full immutable offline envelope.
   There is no parallel receipt, custom outcome result or second reward writer.
   Failure at any stage rolls back context effects, outcome, receipt and awards.

The original online function/signature, source definition triggers, RLS, daily
policies, finance and Crystal Shards functions remain byte-for-byte unchanged.
The two PR #45 online archive/delete characterization tests remain unchanged.
Existing online actions with normal new request IDs continue to work after removal.

## Receipts are acknowledgments, not fresh-source verification

Successful responses contain only:

```json
{
  "state": "confirmed",
  "receipt": {
    "requestId": "<UUID>", "day": "YYYY-MM-DD", "routineId": "<UUID>",
    "status": "completed", "revision": 2
  },
  "reconciliation": "current"
}
```

A matching historical receipt remains available after closure, timezone changes,
archive/delete or a later outcome. Its reconciliation becomes **`manual-review`**
if current source/eligibility no longer agrees. This is not permission to reapply
or silently rebase an old action. A missing owner receipt returns only
`{"state":"not-found"}`; another owner's receipt is indistinguishable from absence.
No other identities, task labels, notes, histories or financial data are returned.

The full mode/day/zone/context/snapshot/definition/routine/revision/status envelope
is durably bound to its owner/request UUID. Retagging any accepted field conflicts;
legacy online receipts cannot spoof offline success and offline IDs cannot be
reused via the online signature. The original exact canonical result is retained
in the one existing receipt; the API projects it rather than inventing a save.
Result shape, identity/status and expected revision range are validated server-side.

A new stale/ineligible write, or mismatched receipt payload, returns **409** with
`reconciliation: "manual-review"`, not a retryable save. Malformed input is 400;
authentication is 401; denied access is 403; unexpected failures are sanitized 503.
Only operation/error code is logged, never raw SQL, metadata or private text.
An ambiguous network result must later be resolved with the original exact intent
using the read-only endpoint. Future #43 code must also refresh verified source;
it must not treat `state=confirmed` alone as proof of current progress or mint rewards.

## Maintenance, Preview and migration boundary

Both routes live below `/api/tasks`, inheriting the existing pre-auth task pause.
The maintenance probe list explicitly covers them (65 methods total, retaining all
55 older probes). The conservative Preview writer inventory includes both POSTs,
even though receipt resolution does not mutate SQL. Restricted Preview denies both
before Auth/real services and never activates any new worker/storage functionality.
No Vercel configuration or deployment was changed.

`0023_offline_outcome_guard.sql` was confirmed unused before creation. It is an
**additive local-only candidate**, installed solely by the guarded loopback Docker
runner. No table/column/policy changes or new user-facing table were necessary;
existing RLS and owner-only direct receipt reads remain unchanged. New internal
helpers have no public/anon/authenticated/service grants; public entry points are
security-definer, fixed empty search_path, authenticated-only and infer the owner.
TypeScript intent/result interfaces are defined alongside the new function contract.
No historical migration, database row interface or hosted migration history changed.

Review dependencies remain 0000–0005 and 0013–0022. No hosted SQL or compatibility
claim is made. Recovery before a future authorized rollout is to disable callers
and remove only the new functions in dependency order if approved; already verified
outcomes/receipts must **not** be deleted or reversed. Do not strip offline payloads
from existing receipts to make online IDs appear reusable. No rollback is run here.

See [validation](piece8ap1-validation.md) for executed tests and limitations.
Issue #18 remains the release blocker. Keep the new PR draft and stop for review.

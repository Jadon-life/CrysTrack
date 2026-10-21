# Issue #43 — offline Today prerequisite audit (BLOCKED)

## Decision

**Do not ship or enable offline writes yet.** The issue's required pre-implementation
audit found a missing server invariant. Its instruction is explicit: “If a missing
invariant blocks safe write replay, stop and propose a smaller server-supported
patch/migration, not a client-side workaround.” This PR follows that stop condition.
It adds local characterization tests and this proposal; it does not implement an
offline queue, change the interface, or claim offline capability.

Approved base: `e35a0f36b7813ac913df7a8075281467588d1e72` on
`feat/crystrack-premium-sep28`. Post-merge run **39425655123**, both `validate` and
`Synthetic boundary tests (local Chromium)` completed successfully at that SHA.
No post-September `main` source was fetched or incorporated.

## Reproduced missing invariant

Issue #43 requires a queued action to enter manual review if its routine was
archived/removed. Existing online semantics intentionally differ: frozen Today
records remain actionable after a routine is archived or hard-deleted. Existing
`daily-records.integration.mjs` tests already preserve that behavior.

The new two-case local reproduction orders three independent committed operations:

1. Device A's preflight observes an active routine, pending status, revision **1**.
2. Device B archives or deletes its definition. Today's frozen status stays pending
   and revision stays **1**; there is no longer an active definition.
3. Device A calls existing `daily_set_outcome` with the original expectedRevision
   and requestId. It succeeds: completed, revision **2**, one receipt and activity
   event. Repeating the same request returns that receipt without duplicate activity.

This is a deterministic interleaving of a read/write race, not a timing-dependent
sleep test. Both cases pass against the guarded disposable local PostgreSQL under
the authenticated owner's role. They characterize the current contract; a passing
result **does not mean offline replay is safe**. Synthetic fixtures only.

Why: `0013_daily_records.sql` captures definition changes effective tomorrow;
`daily_retire_routine` does not invalidate today's routine revision.
`0014_daily_http_conflicts.sql`'s `daily_set_outcome` locks the owner and validates
current day, closure, frozen record, legacy conflict and revision. It does not bind
an offline intent to the current definition's existence/active/archive state.
Week Grid's editable frozen Today cells likewise preserve this online behavior.

Another browser read, Web Locks, BroadcastChannel, a task-list filter or an HTTP
preflight cannot atomically serialize that check with another device's database
transaction. Globally rejecting all archived Today writes would break approved
online behavior. Neither approach is an acceptable workaround.

## Existing authority that can be reused

- `requestId` is owner-scoped and binds the exact payload. Conflicting reuse fails;
  identical reuse returns a stored result before any new mutation. ExpectedRevision
  rejects changed outcomes. Outcome, compatibility row, activity and receipt commit
  transactionally. Closed/cross-day fresh writes are rejected.
- Owner-readable, RLS-protected `daily_mutation_requests` allow **read-only** receipt
  resolution after acknowledgment loss. Direct client writes are denied. An offline
  implementation should not replay a write after day/timezone change merely to
  discover whether it already succeeded. Read the exact receipt and refresh source;
  receipt plus current source disagreement requires review, not automatic rebasing.
- `daily_context` supplies saved scheduling day/timezone. Timezone transitions and
  closing already serialize through the owner lock. The ordinary outcome request
  does not carry an expected timezone/definition context; that must be addressed in
  the proposed offline-specific atomic guard, rather than trusting the client clock.
- A pending local intent must never alter server status, historical evidence,
  activity, Today streak or Crystal Shards. Existing rewards remain server-owned.

## Existing client write paths

`src/app/page.tsx` currently optimistically changes Today checklist state around
its online POST. `src/app/tasks/page.tsx` posts desired state/revision with a fresh
requestId per action. `src/components/tasks/task-week-grid.tsx` already retains an
uncertain requestId/payload in memory across ambiguous failures, but not reloads.
A later queue must coordinate all three entry points, explicitly separate staged
intent from these verified displays, and preserve frozen IDs after an attempted
send. No client controller has been replaced in this prerequisite PR.

## Boot, service-worker and privacy audit

| Boundary | Existing implementation and consequence |
| --- | --- |
| Boot / private navigation | `src/lib/supabase/middleware.ts` calls Auth `getUser()` on private document/RSC navigation; `AuthProvider` also initializes with `getUser()`. Next 16 HTML/Flight is not an offline shell. A cached session is not fresh owner verification. |
| Push worker | `public/sw.js` handles install/activate, push and notification clicks only. No fetch handler or Cache API. Preserve payload handling and click routing exactly. |
| Registration | `AppLayout` registers push for normal signed-in sessions; restricted Preview deliberately unregisters. `src/lib/push.ts` owns registration. No extra worker or background sync is proposed. |
| API reads | Daily context/record responses are private/no-store. Tasks returns richer task/history data and lacks the same explicit response cache header. Never persist that complete response; future snapshot reads must explicitly use no-store and project bounded fields only. |
| Auth lifecycle | `auth-provider.tsx` currently signs out through Supabase and propagates auth events. A future queue needs a device-consent warning, immediate owner-generation fence and clearing across every tab on sign-out/switch; existing cached auth must not hydrate/replay another owner's data. |
| Preview | `src/proxy.ts` applies Preview boundaries before normal services; real Supabase client creation is guarded. Keep demo/blocked builds credential-free, read-only, without IndexedDB activation, workers or external calls. |
| Maintenance | Existing task-write barrier remains in force before authentication; any new replay route must be classified and tested as a task writer. |

### Threat model and support limits for a later implementation

- **Shared device / account switching:** minimal local labels can still be private.
  Require explicit device consent and disclosure; one current verified owner,
  generation fencing, deliberate loss warning and clear action. Broadcast only
  invalidation signals, never labels or credentials. Do not hydrate after reload
  until online Auth verification; no replay after owner invalidation. Already
  transmitted authorized writes may have committed; logout must fence future work,
  not promise to retract network bytes or silently discard ambiguous receipts.
- **XSS / local browser access:** IndexedDB is not a secure vault and encrypting with
  a browser-held key does not solve same-origin XSS. Store only bounded routine
  labels/IDs, day/timezone, verified status/revision and intent/receipt metadata.
  No financial records, AI text, credentials, tokens, cookies, protected histories,
  raw API payloads, HTML or RSC. No third-party telemetry or sensitive logs.
- **Ambiguous delivery:** atomically mark an intent attempted before sending; then
  freeze its exact requestId/payload. Coalesce only unsent intents. Resolve receipts
  read-only before retry; never issue a new ID to disguise an uncertain delivery.
  Do not dequeue until acknowledgment plus refreshed authoritative source agree.
- **Tabs / crashes:** an exclusive Web Lock plus persisted owner/epoch checks and
  transactional IndexedDB updates are needed. A lock alone cannot fix the server
  race above. If the required locking/storage feature is unavailable, fail closed.
- **Day / timezone / changed source:** no background rewriting of old days, revision
  rebasing or client reward credit. Bound queue bytes, count, TTL and saved-zone
  deadline; invalid, expired or incomplete data requires discard/manual review.
  `navigator.onLine` is only a hint, not confirmation of a working server.
- **Reload / navigation:** do not advertise safe full offline reload, private deep
  links or offline navigation. The current authenticated boot depends on the
  network. A later narrow feature should support an **already-loaded page only**,
  with persisted intents recovered after an online verified reload. No private
  response caching or auth bypass to manufacture a PWA guarantee.
- **Browser scope:** Chromium is available locally. Real iOS/Android background,
  suspension and storage-eviction behavior is unverified. Private browsing,
  unsupported storage, quota denial and incomplete snapshots must fail closed.

## Smallest proposed prerequisite — requires independent approval

Do **not** change existing online `daily_set_outcome` semantics. Add a narrowly
scoped offline replay envelope to the existing daily outcome API and a dedicated
server-side atomic guard which:

1. Retains authenticated owner authorization, owner lock, maintenance classification,
   requestId exact-payload binding and existing desired-state/revision semantics.
2. In the **same transaction and owner lock as the outcome**, checks the queued
   source day, expected saved scheduling timezone/context, verified open evidence,
   current routine existence, active/nonarchived eligibility and relevant definition
   version. Any mismatch returns a conflict without writes or rewards.
3. Delegates successful writes to existing outcome/accounting machinery. Normal
   online callers keep their approved contract. Read-only receipt resolution is
   owner-authorized and returns only the minimum required fields.
4. Explicitly binds offline eligibility metadata to receipt identity; changing that
   metadata cannot reuse a request as if it were the same operation. Existing online
   receipt semantics must remain backward compatible. Define receipt lookup versus
   new-write checks carefully so an acknowledged historical result cannot create a
   new historical write or bypass a changed-source conflict.
5. Adds concurrent archive/delete-versus-replay tests in **both lock orders**, plus
   timezone/closure, stale revision, two-owner/anon, ambiguous acknowledgment, retry,
   maintenance, reward provenance and exact-once +5/+50 regressions.

If approved, the next unused candidate is **0023** (inventory ends at 0022).
Append a local-only candidate; never edit 0013–0022, apply hosted SQL or alter
finance/shard rules. Synchronize TypeScript contracts in the same change; no table
change is assumed until the design is reviewed. No candidate or schema change is
included in this audit PR. The existing candidates were reapplied only by the
guarded disposable sandbox reset before validation; no hosted SQL was run.

### Proposed prerequisite file scope

- New `src/db/migrations/0023_*.sql` local-only candidate, only after approval.
- `src/lib/daily-records.ts` for a strict backward-compatible offline envelope and
  minimal receipt DTO; `src/lib/daily-records-server.ts` for authenticated dispatch
  to the atomic guard. Existing occurrence routes remain the outcome API boundary.
- A narrow owner-authorized receipt read route if required; no broad cache endpoint.
- `tests/daily-records.integration.mjs` plus focused contract and maintenance tests
  for both lock orders, metadata binding, owner isolation, rollover and exact-once
  accounting. No UI, finance or service-worker rewrite belongs in that prerequisite.

### Decisions for review

- Approve this offline-specific atomic server prerequisite while retaining the
  intentional archived/deleted-Today **online** behavior.
- Approve the narrow already-loaded-page support limit and online-only restoration
  after reload, with no authenticated response caching or background sync.
- Review source/receipt binding and conflict UX before implementing any queue.

Until then, Issue #43 remains **BLOCKED / not implemented**. Issue #44 is untouched;
Issue #18 remains the hard release gate. No deployment or hosted change occurred.

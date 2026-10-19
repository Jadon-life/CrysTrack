# Piece 4 — September assignment lifecycle

Scope: Issue #25, based only on reviewed development commit `9b7a9eb155da2c12109a585bea47ad97d271bbee` (post-merge CI 39222734385 passed). No post-September main code used. Issue #26's routine Week Grid remains queued.

## User experience

The existing scenic, blue/cyan September page, horizontal navigation, shared reactive glass cards and physical theme switch remain. Academic work has an open list, reassuring past-deadline view, finished history, text/subject/priority/state/date filters and deadline ordering. Reads return 30 rows plus a has-more flag, ordered by deadline then UUID. Seven saved-zone calendar dates show upcoming **deadline counts**, not invented workload hours. Summaries include all owner assignments, independently of list filters; overdue work remains separately visible.

The accessible modal edits active title, description, deadline, priority, subject/category and reminder configuration. It uses a portal, focus containment/return, Escape and labelled controls. Existing custom offsets are preserved. The saved scheduling timezone is displayed beside deadline entry. An unchanged deadline keeps its exact original instant (including seconds); newly entered local times round-trip through all plausible timezone offsets. Nonexistent or repeated DST wall times are rejected by both browser and server. A concurrent saved-zone change is rejected by the database as 409.

Finished Late compares `completed_at > deadline` as instants. Equality is on time. Completing after a deadline preserves the deadline, records the server clock and contributes the original +30 award once. Finished records cannot be edited through the app. No undo or archive was added: a separate reversible-completion contract is deferred rather than introducing another historical rewrite. Permanent deletion requires explicit confirmation describing reminder/activity removal and reward reversal. The immutable crystal accounting audit remains, with a matching reversal; it is not erased.

## Candidate migration — LOCAL ONLY

`src/db/migrations/0016_assignment_lifecycle.sql` follows approved 0015. This is a candidate for disposable Docker testing, **not authorization to apply hosted SQL**. Hosted numbering, migration history and schema compatibility are UNKNOWN. Existing Issue #18 backup, rehearsal, maintenance, old-worker isolation and release-approval blocks remain.

Changes are additive revision and reminder-version columns, owner/deadline/ID index, private helper functions and public owner-bound transaction/read RPCs. A private, RLS-enabled identity tombstone table prevents delayed create retries from resurrecting deleted work; application roles have no access. No financial schema or calculations change. No historical outcomes or rewards are backfilled. TypeScript/Drizzle models are updated alongside SQL.

Authenticated direct INSERT/UPDATE/DELETE on assignments is revoked. `assignment_mutate` is SECURITY DEFINER with empty search_path, explicit `auth.uid()` ownership and owner advisory/row locks; no caller owner, status, completion timestamp, revision write or reward amount is accepted. Public/anonymous execution and private schema access are revoked. `assignment_list` is owner-bound and bounded; the existing owner SELECT RLS remains enabled. The two service-only delivery RPCs cannot be invoked by authenticated/anonymous callers. Existing 0015 crystal source triggers remain the only reward authority.

Create uses a client UUID retained across lost responses. Identical create retry returns the existing row, changed payload conflicts. Active edits and deletion require the observed revision. Completion requires it while active, but an already-finished duplicate returns the recorded result without changing time, activity or reward. A missing owner-scoped delete returns success, including repeat deletion, without disclosing another owner's existence. Edit retry after an ambiguous network failure intentionally requires refresh/review (409); it is not silently reapplied.

Source changes, activity creation/removal, pending reminder replacement and shard trigger effects occur in the same transaction. Completion/delete cannot partially commit those operations. An actual completed source grants +30 once; deletion revokes it through unchanged 0015 accounting. No direct ledger access is added.

## Reminder semantics

Pending reminder rows are generated for the chosen offsets/channels inside the source transaction. Deadline or configuration changes increment reminder_version and replace the pending plan. Metadata-only changes and reordering identical channel/offset sets retain delivery identity, avoiding resends. Existing version-1 legacy delivery keys are honored, so upgrading alone does not resend an already claimed reminder. Past offsets are not retrospectively delivered outside the existing dispatch windows.

The existing cron continues Push/Telegram delivery and DND/urgent behavior. Only assignment DND uses the saved scheduling zone; other domains are unchanged. Assignment dispatch uses a service-only atomic live-source claim: completed/deleted/disabled or stale-version snapshots cannot claim, concurrent claims deduplicate, and failed/partial attempts retain existing retry limits and sent-channel deduplication. Missing channel configuration records a failure without crashing or inventing success. Result settlement locks the source again and cannot resurrect deleted activity. A delivery already claimed and in flight when an edit/delete commits **cannot be unsent**; external messaging has no shared database transaction. This unavoidable delivery race is explicitly bounded to an accepted claim, not a stale unclaimed cron snapshot.

## Compatibility and release risks

- Today/Plan/Calendar retain the active-only array API; Today deadline captions now receive the saved scheduling timezone; it is bounded to 200 rows and exposes `X-Assignments-Truncated`. Extremely large active collections may therefore show only the first 200 in legacy consumers; the assignment page has paging and complete aggregate counts.
- The migration's direct-write revocation intentionally makes older assignment writer binaries incompatible. Any eventual hosted release needs a reviewed coordination/maintenance plan and assignment worker isolation, not a rolling migration while old clients are writing.
- Production auth, finance, verified daily outcomes and Crystal Shards formulas are unchanged. Preview reads use synthetic data, every writer stays blocked. No Vercel setting or hosted service was touched.
- No archive/dismiss/undo, estimated hours, Calendar rewrite or routine Week Grid is claimed.

Validation evidence and actual local screenshots are recorded separately in `piece4-assignments-validation.md`.

# Piece 8A-P2 — offline Today, September development only

Base: `9be18c0c7815d589cb46199bfd87aee430a27cbf`. Both jobs in Actions
39499259461 were SUCCESS before the new feature branch. Issue #43, all its
comments, and independent approval of PR #47 were read. No later main code used.

## Pre-coding source gate

All required fields are available without a new migration or trusted key:

- Authenticated `daily_context`: saved day, timezone, context revision.
- Authenticated `daily_read_window`: raw day `id`, frozen routine
  `schedule_version_id`, status/revision and completeness/closure evidence.
- Owner-RLS SELECT of `recurring_tasks` and `routine_schedule_versions`: current
  active/present/nonarchived definition and latest enabled version UUID.
- `daily_read_week`: owner-lock token incorporates data revision, immutable version
  count and scheduling context. Read it before acquisition and require the same
  token afterward. A changed outcome, archive/delete/definition or context causes
  rejection, rather than a partial projection or guessed identifier.

Local PostgreSQL inspection confirmed owner SELECT grants/RLS on all three daily
source tables and the raw RPC/token implementations. Existing page DTOs strip
some fields; the new no-store GET `/api/tasks/offline/source` projects only the
needed fields. Complete snapshot cap: 50 frozen routines, otherwise unavailable.
The final write still uses the stronger atomic 0023 guard; this read fence is
never substituted for server transaction eligibility. No migration is added.

## Scope and threat model

Already-loaded, previously authenticated normal pages only. No offline reload,
deep link, navigation or PWA guarantee. Middleware/RSC boot and Auth verification
need network. Queue recovery after an ONLINE reload verifies Auth/server owner
before displaying device labels. No private response, HTML, RSC or credential cache.
The push-only service worker is unchanged. Wealth, assignments, bills, CSV, AI and
other domains remain online-only.

Device opt-in explains shared-device/XSS exposure: IndexedDB is not encryption or
an XSS boundary. It contains one minimal owner envelope (routine labels, source
UUIDs/revisions/day/timezone, statuses and immutable intents), no bank/AI/history
responses or new auth storage. Bounds: 64 KiB, 20 pending actions, 50 source rows,
24-hour action usability TTL and at most 12 hours of source freshness, bounded by the saved
local day and its closing instant. No third-party telemetry/background worker.
Browser clock checks only restrict staging; they never authorize a server write.

Web Locks serialize delivery/coalescing across tabs; IDB transaction epoch checks
reject writes after a clear/account fence. BroadcastChannel invalidates views or
announces changed data, without broadcasting labels or credentials. Unsupported
Web Locks/IDB/BroadcastChannel, denied storage, quota or malformed/expired records
fail closed. Safari/iOS/Android support is conditional on those browser APIs;
only executed Chromium checks are claimed, not physical-device certification.

Sign-out warns before losing pending actions, including retained actions hidden
after an Auth failure. Authenticated page content remounts on owner change so
previous-owner page state cannot survive an in-place account switch. Account changes clear stored work
and fence in-flight callbacks. A fresh Auth failure hides local labels and stops
sync; already attempted server requests may have committed and are not reversed.
Clear/discard explicitly warns of this distinction. TTL expiry clears unsaved data
as disclosed at opt-in: active checks or the next verified load prune expired data.
No background physical-erasure guarantee is made while the app/browser is closed
or cannot verify Auth; device-site-data controls remain available. Closing a tab
does not promise safe offline restart.

## Synchronization

Connectivity distinguishes a failed transport (Offline), an unavailable Today
service, and failed Auth verification; navigator.onLine alone never establishes Online.
Canonical checkmarks, counts, streaks and Shards remain server data. Staged intents
have separate unmistakable pending markers. Unsent taps coalesce against their
original revision; attempted/conflicting envelopes cannot be edited or rebased.
A durable attempted marker precedes delivery. Reconnect/manual sync verifies the
server owner and source; attempted entries first resolve the exact request through
the approved read-only receipt endpoint. Not-found may replay only after original
source matches; 409/current definition/day/zone/revision mismatch requires manual
review. A current receipt plus fresh source agreement is required before dequeue
and existing activity/crystal refresh. Network/5xx ambiguity retains the exact ID. A 15-second transport deadline covers
headers and JSON-body consumption, releases the device lock on stalled requests,
and never treats cancellation as proof that a write did not commit. Failed best-effort
clears are caught; device controls also allow clearing orphaned storage.
No new outcome mechanism, privileged writer or client reward calculation exists.

When enabled, disconnected eligible routine actions stage first; delivery is
attempted on reconnect or manual sync. Ordinary online actions keep their existing
writer; successful refreshes replace an empty device snapshot, never rebase pending
intents. Uncertain/conflicting attempts require explicit
review. Opted-out online routines keep their existing API, including frozen Today
behavior after archival/deletion. No hosted/Vercel change or deployment is allowed.
Issue #18 continues to block release; Issue #44 remains out of scope.

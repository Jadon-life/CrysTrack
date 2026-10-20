# Issue #43 — Piece 8A-P2 validation and review handoff

Draft PR: https://github.com/Jadon-life/CrysTrack/pull/48

## Source and scope

Implementation branch: `feat/piece8ap2-offline-today`, based exclusively on
`9be18c0c7815d589cb46199bfd87aee430a27cbf`. Both jobs in the required
post-merge Actions run `39499259461` passed before implementation. Issue #43,
its comments, and the approved PR #47 replay protocol were reviewed.

The pre-coding source gate passed: authenticated daily context, raw frozen daily
snapshot IDs, routine definition UUIDs, daily revisions and owner-RLS definition
reads are available. A before/after owner-lock read token rejects inconsistent
source acquisition. No guessed identifier, new writer or privileged key is used.
See [architecture and limitations](piece8ap2-offline-design.md).

No migration was added or edited. The 17 existing SQL candidates were exercised
only in the guarded disposable local Supabase database. All 172 protected existing
source files (including finance, rewards, AI, CSS, theme, physical switch,
background and push service worker) match the approved base byte for byte. The
six intentional existing-source integration points are layout, Today, Tasks,
auth provider, owner-keyed app content and Week Grid. Reproduce with
`node scripts/audit-offline-source.mjs`; hashes are in
[protected-source.json](validation/issue43p2/protected-source.json).

## Executed local validation

All records, users and screenshots in this evidence are synthetic. No hosted
Supabase data, actual bank statements or external AI provider were accessed.
The test runner explicitly blanks deployed configuration and uses loopback-only
Supabase. Browser suites run serially against the normal local production build.

| Gate | Result | Evidence |
| --- | --- | --- |
| `npm run check` | 263 tests passed; TypeScript passed; ESLint 0 errors, 4 existing warnings | [check.log](validation/issue43p2/check.log) |
| Dedicated queue/source/transport unit subset | 21 passed (included in 263) | [unit.log](validation/issue43p2/unit.log) |
| `npm run test:local:db` | 163 passed, 0 failed | [database.log](validation/issue43p2/database.log) |
| Separate disposable release-barrier rehearsal | 9 passed | [release-barrier.log](validation/issue43p2/release-barrier.log) |
| Maintenance pre-auth barrier | 70 method probes denied; ordinary auth remains available | [maintenance.log](validation/issue43p2/maintenance.log) |
| `npm run test:preview` | Credential-free fail-closed browser and artifact checks | [preview.log](validation/issue43p2/preview.log) |
| `npm run build` | Normal production build passed | [build.log](validation/issue43p2/build.log) |
| Offline Today Chromium | Five widths, both themes, real disconnection/reconnection | [offline-browser.log](validation/issue43p2/offline-browser.log) |
| Retained Chromium regressions | Twelve suites, exact exit statuses recorded | [retained-browser-results.json](validation/issue43p2/retained-browser-results.json) |

The four unchanged ESLint warnings concern existing background-image/hooks and
physical-switch ARIA code. No lint rule was disabled. Browser accessibility
results are scoped automated axe checks, not a claim of complete WCAG certification.

Retained suites: atomic offline guard; Assignments; verified Today streak;
Crystal Shards; Week Grid; monthly budgets; recurring bills; CSV import/export;
money presentation; exact overview/timezones; AI privacy; Calm Today/Wealth combined journey. These retain security,
financial provenance, rewards, consent, owner isolation and cross-feature probes.
The retained Calm harness now supports `--phase=fixture` for guarded local synthetic setup without pretending to capture the obsolete pre-Issue-39 UI. Its unchanged current-interface `--phase=after` workflows are exercised against that freshly prepared financial baseline.
The retained keyboard anchor check waits for actual viewport visibility after native smooth scrolling; the existing Today deadline heading has scroll clearance below the fixed navbar. Focus and viewport assertions remain enforced.
The local DB suite retains both archive/delete-versus-replay concurrency orders
and the original online frozen-record characterizations.

## Offline workflow evidence

The dedicated Chromium workflow verifies complete, skip, undo, coalescing,
immutable attempted IDs, unchanged canonical checkboxes and rewards while queued,
receipt reconciliation, two-tab serialization, lost committed acknowledgements,
a stalled committed response hitting the transport deadline, online reload of
pending actions after Auth, stale revisions, archive/delete conflicts, saved-zone
revision changes, day rollover, quota/unsupported API failures, sign-out warnings,
revoked-Auth hiding without losing the unsynchronized warning, and owner switches.
Normal online completion of a frozen archived Today routine retains the legacy
online writer. HTTP service unavailability is distinguished from offline transport
and failed authentication. No queued action manufactures a verified outcome.

Preview keeps the capable offline provider unmounted. The strengthened suite
checks zero offline IDB opens/Web Locks, zero service-worker/push/geolocation
registration, zero external requests and denied writers. No deployed Preview was
enabled; all Preview checks are a local synthetic build.

## Screenshots and exact handoff

See [synthetic screenshot index](screenshots/issue43p2/README.md) for five-width
light/dark pending views, confirmation, manual conflict review, Auth lock and
owner-switch clearing. The index links the existing committed PR #47 images as
an explicitly historical before reference, rather than claiming fresh baseline
captures. No screenshot recreates a UI from a mockup.

The final exact commit, remote/PR head agreement and both final GitHub CI job
results are recorded on PR #48 after the evidence commit, avoiding a self-referential
commit hash. The PR stays draft for independent review. No merge or deployment
is part of this handoff. GitHub deployment-record checks do not establish direct
access to private Vercel settings; those settings were not changed.

## Honest limits and release blockers

- Already-loaded pages only. Disconnected private boot/reload is tested as blocked;
  there is no offline HTML/API cache or PWA guarantee. Online reload restores device
  work only after fresh authentication.
- Requires IndexedDB, Web Locks and BroadcastChannel in a normal browser. Chromium
  was exercised; physical iOS/Android devices were not certified.
- Optional trusted-device storage is not encryption or an XSS boundary. It retains
  only bounded routine metadata/intents, never financial/AI responses or credentials.
- Up to 20 pending intents/64 KiB and 50 frozen source routines; source freshness
  is at most 12 hours and current saved day closure. Action usability expires after
  24 hours. Physical pruning occurs during active checks or the next verified load;
  a closed browser cannot promise background erasure.
- Missing/incomplete authoritative source, changed owner/day/zone/definition/revision
  or unresolved receipts fail closed and require review, rather than unsafe rebasing.
- Other domains remain online-only. Existing push-only service worker is untouched.
- No hosted migration, production data, Vercel setting, deployment, `main` change,
  merge, Issue #44 feature or post-September code import was performed.
- Issue #18 remains the hard production-release blocker. Independent review is
  required before any further release action.

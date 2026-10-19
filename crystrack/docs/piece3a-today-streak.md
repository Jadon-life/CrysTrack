# Piece 3A: verified Today streak (Issue #21)

## Scope and authority

Based only on September development head `8d4757c24656d7f7f9f7593d0ef408ef36915fcc`.
Both base CI jobs passed before implementation. No main source was fetched, copied,
merged or cherry-picked. The scenic backgrounds, horizontal navigation, physical
Three.js switch, finance implementation and maintenance controls are unchanged.
No schema, migration, RLS, hosted settings or deployment changes.

Today now places a compact **Daily streak** GlassCard above Goal check-ins.
`src/lib/today-streak.ts` validates the saved-zone context and assembled window,
then invokes the existing `calculateDailyStreak()` engine. The only history reads
are `/api/daily-records/context` and `/api/daily-records?from=...&to=...`.
The server's existing `readDailyWindow()` remains responsible for complete child
pagination and pinned revisions; the client does not accept raw RPC page bodies.
No task streak, current task schedule, activity event, local cache or legacy
occurrence is used to reconstruct eligibility.

Seven saved-zone calendar keys end on the server's today. The current count and
observed best exclude today even when all its routines are done. Unknown gaps and
installation-day incomplete evidence cannot earn/bridge days. Verified-empty days
are neutral. Incomplete closed days break runs. `historyFromBeginning` is always
false; best is explicitly a lower bound in this seven-day window, never lifetime.
A null current or wholly unavailable history displays **Not yet verified**, not
zero. Duplicate/conflicting/absent evidence cannot produce a successful cell.
HTTP failures, missing RPC, invalid zones and malformed responses display
**History not yet verified**, with an accessible refresh button.

Task completion/skip/undo attempts refresh authority after settlement, including
ambiguous failed responses. No optimistic task state awards streaks. Refreshes
clear stale counts, abort prior transport and invalidate older generations. One
saved-zone midnight timer and tab-return checks handle boundaries; no dashboard
polling. A context/window boundary mismatch gets only one fresh pair of reads.
A changed context refreshes Today's existing data load. No finance write is added.
Private/no-store endpoint headers and Preview service isolation are unchanged.

## Browser evidence (synthetic local data only)

Normal-mode Chromium loaded `2026-10-19`, scheduling zone **Africa/Lagos**, window
`2026-10-13` through `2026-10-19`:

| Date | Authoritative classification | UI |
| --- | --- | --- |
| 2026-10-13 | Absent history | Unverified |
| 2026-10-14 | Incomplete installation-day evidence | Unverified |
| 2026-10-15 | Verified, closed, unfinished | Incomplete day |
| 2026-10-16 | Verified, closed, all completed | Completed day |
| 2026-10-17 | Verified, closed, zero scheduled | Verified no tasks (neutral) |
| 2026-10-18 | Verified, closed, all completed | Completed day |
| 2026-10-19 | Verified, open; pending then completed | Today in progress |

Current: **2 days**. Best observed: **At least 2 days**. Completing today did not
change either count. Initial accessible label was `0 of 1 completed`; screenshots
after the mutation/replay tests show `1 of 1 completed`, still open. Simulating a
local saved-zone transition to `2026-10-20` and returning to the tab refreshed Today
and the window: the newly closed yesterday then raised the current streak to 3.

- [Before Today](screenshots/issue21/before-today.png): actual baseline dashboard,
  captured in local Next dev before integrating the new component (dev indicator).
- [After Today](screenshots/issue21/after-today.png): actual normal production build,
  synthetic signed-in owner, with all-tasks-done today still excluded from streak.
- [Mobile card](screenshots/issue21/after-mobile.png): 375px viewport; seven cells fit.

Screenshots were visually inspected. The original adaptive scene selection remains
active, so independent browser sessions may show different approved scenes.

## Validation

Executed on Node 24.19.0, npm 11.9.0, PostgreSQL 15.8 Docker sandbox and system
Chromium 154. No hosted database, finance record or Vercel request was used.
The local SQL fixture temporarily overrides only the sandbox clock, restores it in
`finally`, and deletes only its synthetic auth identity. Do not run the browser
harness concurrently with the local DB suite (both control that disposable clock).

| Command | Result |
| --- | --- |
| `npm ci --cache /tmp/crystrack-npm-cache` | PASS, frozen lockfile, 544 packages |
| `npm run check` | PASS, 154 tests (13 new), typecheck, lint: 0 errors / 4 existing warnings |
| `npm run local:start` then `npm run local:reset` | PASS, fixed loopback Docker target only |
| `npm run test:local:db` | PASS, 31 tests, 0 skipped |
| `CRYSTRACK_CHROMIUM_PATH=/usr/bin/chromium npm run test:preview` | PASS, 12 routes, 34 writer routes blocked, 5 hosted markers absent, 0 external requests/runtime errors; missing-flag mode fails closed |
| `npm run build` (sanitized local environment below) | PASS, ordinary normal-mode artifact |
| `node scripts/test-today-streak.mjs --baseline` | PASS, before screenshot from original dashboard |
| `node scripts/test-today-streak.mjs` | PASS, real local authentication and authoritative RPC-backed normal UI |
| `git diff --check` | PASS |

The normal browser harness checks completion/skip/undo, identical request replay,
missing RPC, absent snapshots, racing refreshes, keyboard refresh, locale/date and
status labels, reduced motion, 375/430/768/1280/1440px layouts, no finance mutation,
and saved-zone tab-return transition. It blocks external browser traffic before
transport (five normal-mode attempts in the final run); this is distinct from the
restricted Preview test, which attempted **zero** external requests.

The build command used only guarded local sandbox keys, blanked all configuration
keys declared in `.env.example`, and inherited the local runner's allowlisted
non-secret environment. Reproduce from `crystrack/` with the sandbox running:

```sh
node --input-type=module <<'JS'
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {readLocalKeys} from './scripts/local-supabase.mjs';
import {localEnvironment} from './scripts/local-supabase-policy.mjs';
const blank=Object.fromEntries(fs.readFileSync('.env.example','utf8').split('\n')
  .filter(l=>/^[A-Z][A-Z0-9_]*=/.test(l)).map(l=>[l.split('=')[0],'']));
const result=spawnSync('npm',['run','build'],{
  env:{...localEnvironment(process.env),...blank,...readLocalKeys(),
    VERCEL_ENV:'production',NEXT_TELEMETRY_DISABLED:'1'},stdio:'inherit'});
process.exitCode=result.status??1;
JS
```

Preview tests intentionally replace `.next`; rebuild normal mode afterwards.
Detailed ephemeral results/screenshots remain ignored under `.preview-test/`.

## Limits / review gate

No hosted migration or deployment was run; installed production RPC/schema and
real-user historical coverage were not inspected. This UI cannot manufacture
pre-capture history and observes at most six closed days plus open today. Manual
screen-reader testing and other browser engines were not performed. Four existing
lint warnings remain in `environment-background.tsx` (three) and
`physical-theme-switch.tsx` (one); no new lint warning was added.

The independent Issue #18 live-release safeguards remain blocking as before.
This PR does not certify hosted release readiness, change Preview settings, or
install the local release barrier anywhere. Draft PR only; stop for review.

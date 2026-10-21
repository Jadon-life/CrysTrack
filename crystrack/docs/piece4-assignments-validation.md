# Issue #25 — local validation evidence

Base verified via remote ref: `9b7a9eb155da2c12109a585bea47ad97d271bbee`, branch `feat/crystrack-premium-sep28`. GitHub base run [39222734385](https://github.com/Jadon-life/CrysTrack/actions/runs/39222734385) passed. Implementation branch: `feat/piece4-assignments`. No main source was fetched/imported. No hosted database/Vercel/deployment operation was performed.

## Executed on October 19, 2026

- `npm ci --cache /tmp/crystrack-npm-cache`: passed, 544 packages. Node 24.19.0 locally; existing GitHub CI uses Node 22.
- `npm run check`: 164/164 application tests, zero failures/skips; TypeScript passed; ESLint zero errors. Four pre-existing warnings remain: environment-background hook dependencies (2) and img optimization (1), physical-theme-switch aria-description (1). Those approved components were not modified.
- `npm run local:reset`: only dedicated `crystrack-local-free` Docker stack on loopback, synthetic data. No Supabase link/login/hosted credentials.
- `npm run test:local:db`: **60/60**, zero failures/skips. Includes 12 assignment cases and all 48 existing daily/crystal/local cases. Owner isolation, anonymous/private/direct-write denial, revision conflicts, real concurrent completion/edit, idempotent completion, create/delete replay, failure rollback, reminder versions/claims/retries, legacy delivery keys, sparse legacy completion evidence, finance isolation, original +30/reversal, timezone midnight/DST/leap/pagination/filter behavior passed.
- `CRYSTRACK_CHROMIUM_PATH=/usr/bin/chromium npm run test:preview`: actual synthetic build and Chromium across all 12 routes; 36 inventoried API writer routes blocked (including new assignment PATCH method), five fake hosted client markers absent, zero external requests, zero browser errors, missing-mode fail-closed checks passed. This was local execution, not an enabled or deployed Vercel Preview.
- `npm run build`: normal optimized build passed with **all declared integration variables blanked**, then only guarded local Supabase bindings supplied. No inherited hosted database key was used. Rebuilt normal artifact after the separate synthetic Preview build.
- `CRYSTRACK_CHROMIUM_PATH=/usr/bin/chromium node scripts/test-assignments.mjs`: real synthetic local Auth, normal Next server, live local REST/RPC, Chromium. Create → edit/reschedule → overdue → Finish Late → finished history → confirmed delete passed. Simulated lost completion response/retry persisted one completion/event/+30, then deletion revoked it. Actual local cron without configured Push/Telegram returned gracefully, persisted both failed channels and deduplicated repeat dispatch. Server rejected DST gap/fold inputs. Browser America/New_York and saved Africa/Lagos deadline matched the stored instant. Today/Plan active-only contract and verified Today card retained; Today deadline caption also used the saved zone despite the different browser zone. Local finance rows unchanged.
- Widths **375, 430, 768, 1280, 1440**: no page/card horizontal overflow; Finish Late touch target at least 40px. Editor focus containment, return and Escape passed. Reduced-motion glass animation disabled; description 14px. Physical theme switch and light/dark preference worked. Actual approved photographic background loaded. Bright scene uses only a synthetic browser clock; server deadline/completion facts were not altered for that screenshot.
- Normal signed-in browser blocks all outbound requests before transport. Twenty attempted weather/location requests were blocked; **zero runtime errors**. These normal-mode blocked attempts are distinct from Preview's zero outbound attempts.

The initial local runs exposed and corrected a reminder retry SQL variable reference and test-parser/accessible-name/interception harness issues. Final results above are from completed passing runs. The candidate migration was reset/reapplied locally after its final changes; source/hash integrity check passed.

Additional executed regressions:

- `CRYSTRACK_CHROMIUM_PATH=/usr/bin/chromium node scripts/test-crystals.mjs`: passed the existing signed-in routine/goal/late-assignment/expense/retry/closure/level/settings/account-switch workflow; zero runtime errors. Its synthetic expense fixtures were cleaned by the runner.
- `CRYSTRACK_CHROMIUM_PATH=/usr/bin/chromium node scripts/test-today-streak.mjs`: passed existing verified-history, completion/skip/undo/replay/race/error/midnight and five-width checks.
- `node scripts/test-task-maintenance.mjs --synthetic-local-only=ISSUE19-NO-HOSTED`: 50/50 task/daily/cron method probes returned 503 before auth; ordinary auth page accessible.
- `git diff --check`: passed.

## Screenshots (actual synthetic local browser)

- [Unfinished overdue, dark](screenshots/issue25/overdue-desktop.png)
- [Light preference](screenshots/issue25/overdue-light.png)
- [Bright daytime photo](screenshots/issue25/overdue-bright.png)
- [Assignment editor](screenshots/issue25/edit-form.png)
- [Finished Late history](screenshots/issue25/finished-late.png)
- [375px mobile](screenshots/issue25/mobile.png)
- [Machine-readable browser checks](screenshots/issue25/browser-evidence.json)
- [Synthetic Preview boundary evidence](screenshots/issue25/preview-safety.json)

Screenshots were visually inspected for the approved September horizontal navigation, scenic background, blue/cyan palette, glass reading surfaces, legible forms and card composition. This is not a formal WCAG certification or a live hosted delivery test.

## Migration inventory and outstanding release blocks

New candidate: `0016_assignment_lifecycle.sql`, SHA-256 `8cd6d07b79056d0f594716a540159fc2c7ae3342599e99a0b36cc81e78ec5a97`. Applied **only locally**. Existing 0013–0015 source hashes are unchanged. Ten explicit bootstrap files: 0000–0005 and 0013–0016. Private RLS identity tombstones and revision/index/RPC changes have matching Drizzle/TypeScript models.

Hosted schema/history, migration numbering, backup/recovery and worker compatibility remain **UNKNOWN/unverified**. Issue #18 release blocks remain. Older direct assignment writer binaries are incompatible with the deliberate direct-DML revocation; any eventual migration requires a reviewed coordinated maintenance/application rollout. Nothing is authorized for hosted application here.

No undo/archive/dismiss, estimated workload hours or Piece #26 Week Grid was implemented. Legacy Today/Plan/Calendar array consumers remain bounded to 200 active rows with a truncation header; the assignment view itself pages and aggregates complete counts. A notification already claimed and sent/in flight cannot be recalled; stale unclaimed schedules are rejected and settlement cannot resurrect deleted activity. Live Push/Telegram transport and hosted auth were intentionally not tested.

Independent review and GitHub CI are required before any merge. PR and exact commit/CI evidence are recorded in the PR and delivery report.

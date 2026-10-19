# Issue #23 local validation — 19 October 2026

Branch: `feat/piece3b-crystal-shards`, based on reviewed dev
`3ea5c3cd60ffa7880f7c62dbd1040a8c367761d1`. No main code/import/merge.

## Commands and results

Executed from `crystrack/`, Node 24.19.0/npm 11.9.0, local PostgreSQL 15.8 Docker,
Chromium 154. All auth identities, task records and money entries were synthetic
and confined by the existing fixed Docker/loopback assertions. No hosted Supabase,
Vercel environment/settings, production record or paid resource was used.

| Command | Result |
| --- | --- |
| `npm ci --cache /tmp/crystrack-npm-cache` | PASS, 544 packages, unchanged lockfile |
| `npm run check` | PASS, 159 tests; TypeScript passed; ESLint 0 errors / 4 pre-existing warnings |
| `npm run local:start`, then `npm run local:reset` | PASS, disposable fixed local project only |
| `npm run test:local:db` | PASS, 48 tests (31 existing + 17 reward integration), 0 skipped |
| `node --test --test-concurrency=1 tests/crystals.integration.mjs` | PASS, 17 isolated reward integration tests |
| `CRYSTRACK_CHROMIUM_PATH=/usr/bin/chromium npm run test:preview` | PASS, 12 routes, 36 writer routes blocked, 5 hosted markers absent, 0 external requests / runtime errors; absent flag fails closed |
| `npm run build` using sanitized local configuration | PASS, normal artifact restored after Preview |
| `node scripts/test-crystals.mjs` | PASS, real local auth + normal-mode reward flows; 5 viewport widths |
| `node scripts/test-today-streak.mjs` | PASS, existing Piece 3A completion/skip/undo/replay/race/day-transition regression |
| `node scripts/test-task-maintenance.mjs --synthetic-local-only=ISSUE19-NO-HOSTED` | PASS, 50 task/daily/cron probes denied before auth with 503 |
| `git diff --check` | PASS |

The normal build used `localEnvironment(process.env)`, blanked every declared
`.env.example` key, then overlaid only `readLocalKeys()` and
`VERCEL_ENV=production,NEXT_TELEMETRY_DISABLED=1`. The guarded key reader verifies
loopback and the dedicated Docker project before starting `npm run build`. See the
same complete reproducible command in [Piece 3A validation](piece3a-today-streak.md).
No inherited hosted binding was used. Run browser/DB clock suites sequentially.

The four existing lint warnings are unchanged: three in
`environment-background.tsx`, one in `physical-theme-switch.tsx`. Initial validation
caught stale test expectations for the intentional late-completion change and
migration count, synthetic-fixture cleanup, and a clipped mobile menu. Those were
corrected and the relevant suites rerun; no check was bypassed. The network-failure
browser test deliberately induces one handled fetch error; no unhandled browser
runtime error remains.

## Evidence

Normal-mode Chromium signed in a new synthetic owner. Saved scheduling zone:
**Africa/Lagos**. Open test day initially **2026-10-19**, then controlled local
closure into **2026-10-20**. The sequence was:

1. Today routine complete/undo/recomplete: net shards **5 / 0 / 5**. Existing verified
   streak remains separate and open-day completion does not count as closed.
2. Actual goal check-in form: **+25**, total 30.
3. Actual overdue assignment checkbox/API: **+30**, total 60, without deadline block.
4. Wealth expense form logs **2500.25 NGN**, **+5**, total 65. The first response is
   deliberately lost *after commit*. Retrying the same form persists one row only.
   An identical HTTP replay returns that row; changed payload returns 409.
5. Two simultaneous identical new expense submissions (0.25 NGN) return 201/200,
   persist one source and earn **+5 once**, total 70.
6. Advance only sandbox/server and browser clocks: trusted verified non-empty day
   closure earns **+50 once**, total 120. Yesterday joins the existing streak.
7. 76 synthetic one-naira expense records through authenticated source transactions
   earn 380, yielding **500** total. No award/total was inserted or forged. The nav
   and Insights show **level 2 · Raw**, **0 of 600** toward level 3.
8. Capture gold moment, click Skip, reload: no repeated moment. Keyboard rewards
   OFF hides gem and Insights card; a fresh task completion while off earns nothing.
   Re-enabling does not catch up that action or repeat the moment.
9. Exact numeric financial snapshot before/after these preference/task operations:
   **78 rows, sum `2576.50`**, unchanged byte-for-byte. Reward triggers do not modify
   money values/targets or use raw JS floating-point monetary arithmetic.

Normal browser checks used en-NG locale, reduced-motion emulation, accessible
progress labels, keyboard settings interaction and 375/430/768/1280/1440px widths.
All visible header controls and the crystal card fit. Normal-mode weather/location
requests were blocked before external transport (40 attempts in the final run).
This differs from restricted Preview, which made **zero** external attempts and
constructed no real session/service clients. Auth/API probes were loopback only. Real local sign-out and sign-in to a second
synthetic owner verified a zero-shard level-1 crystal, without the first owner’s
500-shard summary. Pending reads/configuration replies are bound to owner identity.

The reward integration suite covers exact source values, canonical ownership,
RLS/anonymous/foreign access, fake activity events, immutable identities, automatic
origin/FK clearing, transfer/savings exclusions, repeat/replay/concurrency, undo and
rollback, true all-done closure and neutral/incomplete days, OFF/ON transitions,
ledger rebuild, first-level claim races, level regain without repeated moment,
open-day evidence correction and the independent local maintenance freeze.
Pure tests cover 0/499/500/1099/1100, per-segment integer rounding, stage boundaries
through Radiant, large exact integer totals and strict non-spoofable input schemas.

## Actual screenshots

- [Desktop Insights](screenshots/issue23/insights-desktop.png)
- [375px nav and crystal card](screenshots/issue23/mobile.png)
- [Skippable first-level gold moment](screenshots/issue23/level-moment.png)
- [Rewards OFF settings](screenshots/issue23/rewards-off.png)

Screenshots were visually inspected after fixing the narrow header overflow. They
show the actual normal-mode application with local synthetic records, not mockups.
Background scene selection and Three.js switch code are retained.

## Migration inventory / review blockers

Only new candidate: `src/db/migrations/0015_sep28_crystal_shards.sql`.
SHA-256: `1b882c2bcd54b316c9d55d9e595b017152e9d2c049331fb720cd18e90c547b50`.
Applied/tested **locally only**, after 0014; all 9 local migration hashes verified.
No legacy SQL migration or hosted migration history was changed.

Production compatibility remains **UNKNOWN / NOT RELEASE-READY**. Hosted legacy
schemas, source triggers/generated-money origins, migration-number collisions,
backup and Issue #18 release-gate requirements need independent approval and a
sanitized isolated structural rehearsal. No hosted query or migration was used to
claim compatibility. Full design/security and rollback considerations are in
[piece3b-crystals.md](piece3b-crystals.md).

Manual screen-reader and non-Chromium engines were not tested. At-most-once moment
claims may be consumed if a tab/network closes before presentation; they never
replay on refresh. Existing clients that do not send an expense submission UUID
remain distinct new entries per POST; the app's form retains its UUID for retries.
No production authentication/service integration or live deployment is certified.
Draft PR only; stop for independent review, with no merge or deployment.

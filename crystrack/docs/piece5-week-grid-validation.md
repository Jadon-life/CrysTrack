# Issue #26 — local validation evidence

Base: `feat/crystrack-premium-sep28` at
`ccd3d22cf7542edc112fd4945310a1892684b575`. Exact remote head and
[post-merge CI 39246699815](https://github.com/Jadon-life/CrysTrack/actions/runs/39246699815)
were verified green before implementation; remote base was checked again before
delivery. Feature branch: `feat/piece5-task-week-grid`. No source from `main`
was fetched or imported. See [implementation decisions](piece5-week-grid.md).

## Executed October 19, 2026

- `npm ci --cache /tmp/crystrack-npm-cache`: passed, 544 packages.
  Local Node 24.19.0; existing GitHub CI uses Node 22. Chromium 154, Playwright
  1.57.0 and pinned dev-only axe-core 4.10.3 were used locally.
- `npm run check`: **169/169** application tests, zero failures/skips;
  TypeScript passed; ESLint zero errors. Four existing warnings remain in the
  unchanged environment background (two hook dependencies, one img optimization)
  and physical theme switch (one aria-description). No suppression was added.
- `npm run test:local:db`: **71/71**, zero failures/skips, including eleven
  new Week Grid cases and all sixty existing daily/crystal/assignment/local cases.
  Only the dedicated loopback Docker stack `crystrack-local-free` was used,
  with synthetic identities and fixtures. The new SQL was reset/reapplied and
  hash-checked locally after its final changes.
- DB evidence: owner/anonymous/private-function ACL, no new write grants,
  complete and partial historical headers, missing and verified-empty days,
  frozen/deleted names, future effective schedule edits and date bounds,
  **1,001 children** with global completeness before unique keyset paging,
  outcome/schedule cursor conflicts, removed activity events, undo/reversal,
  actual competing desired-state writes and replay, saved-zone midnight,
  leap/year/DST dates, pending/applied date gaps, real local Auth/PostgREST and
  unchanged finance rows all passed.
- `npm run test:preview` with `CRYSTRACK_CHROMIUM_PATH=/usr/bin/chromium`:
  synthetic build, all **12 routes**, Week Grid navigation with writes disabled,
  **36 API writer routes** denied, five fake credential/artifact markers absent,
  missing-mode fail-closed checks, **zero external requests and browser errors**.
  This was a local browser test, not a Vercel deployment.
- `npm run build`: optimized normal build passed, after all declared integration
  bindings were blanked and only guarded local Supabase keys supplied privately.
  Rebuilt normal mode after the separate synthetic artifact. No hosted key or
  connection was used, and `VERCEL_ENV=production` selected the local normal
  artifact only; it did not deploy anything.
- `CRYSTRACK_CHROMIUM_PATH=/usr/bin/chromium node scripts/test-week-grid.mjs`:
  full signed-in local Auth/REST/RPC workflow passed on the final reading surfaces.
  Complete/undo/skip/unskip, keyboard focus restoration, exact request replay
  after committed-but-lost response, real competing-write 409, denied past/future
  mutations, endpoint failure/recovery, 34-row pagination, filters, stale schedule
  cursor reset and saved-zone/day transition all passed. Completing two open-day
  tasks awarded only their existing +5 each, never premature +50. Finance rows
  remained unchanged; no browser runtime errors. Five normal weather/location
  attempts were intercepted before external transport (distinct from Preview's
  zero outbound attempts).
- Week Grid widths **375, 430, 768, 1280, 1440**: no document overflow;
  sticky labels/headers, horizontal scrolling, full-date accessible names,
  focus exposure for offscreen actions, reduced motion and >=40px targets passed.
  Scoped axe WCAG 2 A/AA and 2.1 AA checks found **zero violations** at every
  width. Axe marked photographic `color-contrast` for manual review; this is not
  a whole-application accessibility certification. Actual desktop/mobile images
  were inspected, sticky label ghosting corrected with opaque label surfaces,
  and the week range moved outside horizontal scrolling.
- Existing normal-browser regressions passed: `test-assignments.mjs` (full
  lifecycle, reminders, saved-zone DST, physical switch, five widths, focus and
  unchanged finance), `test-today-streak.mjs` (verified history, actions, replay,
  stale reads, midnight and five widths), and `test-crystals.mjs` (source rewards,
  retry, reversal, closure, levels, settings and account isolation).
- `node scripts/test-task-maintenance.mjs --synthetic-local-only=ISSUE19-NO-HOSTED`:
  **55/55** task/daily/cron method probes, including the new week path, denied
  with 503 before auth; ordinary auth page remains accessible.
- `git diff --check`: passed.

Initial validation found an SQL local-variable ambiguity, a malformed-response
validator edge case and browser/lint harness issues; they were corrected before
the final passing runs. One earlier build overlapped dependency installation and
failed; installation and the final build were rerun sequentially. The existing
Assignments test initially sampled focus between dialog removal and Radix's
focus restoration; its assertion now waits up to five seconds for the same
required trigger focus. Application modal code was not changed.

## Actual synthetic screenshots and evidence

- [Before: approved Tasks view](screenshots/issue26/before.png)
- [After: Week Grid desktop](screenshots/issue26/after-desktop.png)
- [After: 375px mobile, scrolled to Today](screenshots/issue26/after-mobile.png)
- [Sticky labels and mobile scroll detail](screenshots/issue26/mobile-scroll.png)
- [Unverified historical week](screenshots/issue26/history-unverified.png)
- [Machine-readable Week Grid checks](screenshots/issue26/browser-evidence.json)
- [Synthetic Preview safety checks](screenshots/issue26/preview-safety.json)

The baseline was captured before the UI edits, not recreated later. The full
Week Grid fixtures intentionally fix the synthetic clock at October 22 and use
Africa/Lagos scheduling with a New York browser; this is test data, not user
activity. The scenic background, blue/cyan palette, horizontal navigation and
Three.js switch remain unchanged. No new sidebar, shell or calendar framework.

## Migration inventory and release limitations

New candidate: `0017_task_week_grid.sql`, SHA-256
`c69321e6f99ff9260b65d6a093871c7965b3fc40cf7b29be223ab8724085b4b5`.
It adds a read RPC and two private helpers; **no tables or schema interfaces
change**. New response types and validation are in `src/lib/week-grid.ts`.
Existing 0016 hash remains
`8cd6d07b79056d0f594716a540159fc2c7ae3342599e99a0b36cc81e78ec5a97`.
Local explicit inventory is eleven files: 0000–0005 and 0013–0017.

**Applied locally only.** Hosted migration history, numbering, compatibility,
backup/recovery and worker coordination remain UNKNOWN. Issue #18 remains the
release gate, including the earlier 0016 candidate. No hosted Supabase data,
Vercel configuration, production or main changes, manual deployments or merges.
Live Push/Telegram delivery and hosted auth were deliberately not exercised.

The read retains existing `daily_context` bounded recovery, which can close
genuine elapsed days through existing reward triggers; it adds no independent
award rule and never captures future occurrences. Review this established read
behavior as part of the existing hosted rollout gate. Future cells are editable
plans from schedule versions, not immutable outcomes or inline schedule editors.
Partial past data deliberately shows Unverified, even for individually known rows.

GitHub PR, exact implementation SHA and CI results are recorded in the draft PR
and delivery report. Independent review is required before any merge or release.

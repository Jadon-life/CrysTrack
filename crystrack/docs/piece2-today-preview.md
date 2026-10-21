# Piece 2 — Today checklist (preview slice, no migration)

## Implemented
- Show every scheduled task, grouped as Morning, Afternoon, Evening, or Anytime inside a scrollable card.
- Use saved profile timezone (falling back to detected timezone or UTC) for the day key and weekday; load the corresponding existing task occurrences.
- One-tap completion/uncompletion and deliberate Skip/Unskip through the existing task endpoints, optimistic feedback with rollback on error, and a 7-second Undo action.
- Progress ring and factual count of done, remaining and skipped tasks. An all-done message only appears when all scheduled tasks were actually completed.
- Summary-card links, due-soon assignments sorted by deadline, and removal of the greeting emoji.
- The formerly static "Today note" has been truthfully relabelled "Daily reminder" until real note persistence is ready.

## Deferred — not implemented
- Daily-streak UI and persisted eligibility snapshots remain deferred. Piece 2A adds only the pure engine described below. The current `/api/tasks` `streak` is PER TASK and must not be presented as the proposed all-tasks-done daily streak.
- Saving daily notes requires a new user/date table and RLS; these need an isolated Supabase staging target and verified migration history.
- Broader time-zone migration across all routes, including reminders and weekly summaries; this pass scopes date correctness to the Today dashboard.
- No finance compatibility merge, financial writes, schema changes, or production deployment.

## Validation
Pure helper tests execute real TypeScript logic covering timezone midnight, 20 tasks, skips/undo transitions, grouping and due-soon assignment sorting. UI wiring has source checks. A live preview browser interaction was not tested against Supabase because preview/production database isolation remains UNKNOWN.

## Piece 2A — pure daily-streak engine (Issue #5)

`src/lib/daily-streak.ts` has no database, environment, UI or wall-clock access.
`calculateDailyStreak` takes an explicit clock, saved timezone, coverage start,
whether that start is the known beginning of tracked history, and durable daily
snapshots. Dates are strict local `YYYY-MM-DD` keys. Invalid timezones fail rather
than silently changing the day to UTC. Calendar stepping is independent of DST.

Each snapshot must establish the historical scheduled routine IDs and complete,
explicit outcomes. `evidence: verified` is a caller assertion that BOTH schedule
evidence and occurrence pagination are complete; this engine cannot certify it.
Do not construct historical eligibility from today's task schedules, active state,
archiving or deletion. Supply one authoritative latest snapshot per day, not a
mutation/event history. A pending outcome represents unskip or undo; do not send
old and new outcomes together. Identical occurrence duplicates are deduplicated;
conflicting outcomes, duplicate day snapshots, unexpected routine IDs, missing
outcomes and incomplete evidence make that day unknown. Missing days in the
declared coverage are also unknown, including apparently empty days.

- `success`: every scheduled routine is completed, with at least one scheduled.
- `neutral`: explicitly verified zero scheduled routines; neither earns nor breaks.
- `incomplete`: verified scheduled work includes pending, skipped or missed work.
- `unknown`: insufficient or conflicting evidence; never earns or bridges a run.

`today` is open-day progress only. Both `current` and `best` describe closed days
through yesterday; even a successful today is not added until it closes. Today's
incomplete/unknown progress never resets the prior closed-day streak. A verified
incomplete closed day breaks continuity. Unknown days split observed runs.

`current.value` is null with `status: partial` if unknown earlier evidence could
extend/change the current streak; `verifiedDays` is only the known trailing count.
A known break can establish an exact current value even with older unknown days.
`best.observed` is the largest verified segment, a lower bound rather than an
absolute lifetime best when `best.status` is partial. `coverage.complete` requires
the known tracked beginning and no unknown closed days; `unknownDates` lists gaps.
Coverage starting today has no closed days (`through` is yesterday).

Streak Shield is fixed OFF (`shield.enabled: false`); true is unsupported, including
at runtime. No earning, consumption, protection or persistence is implemented.
There is no Today import, endpoint or displayed new daily-streak value.

Run `node --test tests/daily-streak.test.mjs`, then `npm run check` and
`npm run build`. Behavioral tests execute the engine, including 20 routines,
duplicates, incomplete pagination, schedule changes, historical deleted/archived
IDs, local midnight, DST, leap days and disabled shields.

### Remaining integration blockers

Production/preview/staging Supabase identities and isolation remain UNKNOWN.
Durable historical eligibility, verified migration history, an authoritative
day-close policy, timezone-change policy and transactional occurrence updates
are prerequisites for an integrated daily streak. Historical records must not be
invented or rewritten. Saved daily notes require separately reviewed user/date
storage and RLS. Shield rules need separate product approval. No migration,
Supabase request, finance integration or deployment is part of Piece 2A.

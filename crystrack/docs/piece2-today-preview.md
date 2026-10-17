# Piece 2 — Today checklist (preview slice, no migration)

## Implemented
- Show every scheduled task, grouped as Morning, Afternoon, Evening, or Anytime inside a scrollable card.
- Use saved profile timezone (falling back to detected timezone or UTC) for the day key and weekday; load the corresponding existing task occurrences.
- One-tap completion/uncompletion and deliberate Skip/Unskip through the existing task endpoints, optimistic feedback with rollback on error, and a 7-second Undo action.
- Progress ring and factual count of done, remaining and skipped tasks. An all-done message only appears when all scheduled tasks were actually completed.
- Summary-card links, due-soon assignments sorted by deadline, and removal of the greeting emoji.
- The formerly static "Today note" has been truthfully relabelled "Daily reminder" until real note persistence is ready.

## Deferred — not implemented
- Full-day streak rules, best streak and optional streak shield. The current `/api/tasks` `streak` is PER TASK and must not be presented as the proposed all-tasks-done daily streak.
- Saving daily notes requires a new user/date table and RLS; these need an isolated Supabase staging target and verified migration history.
- Broader time-zone migration across all routes, including reminders and weekly summaries; this pass scopes date correctness to the Today dashboard.
- No finance compatibility merge, financial writes, schema changes, or production deployment.

## Validation
Pure helper tests execute real TypeScript logic covering timezone midnight, 20 tasks, skips/undo transitions, grouping and due-soon assignment sorting. UI wiring has source checks. A live preview browser interaction was not tested against Supabase because preview/production database isolation remains UNKNOWN.

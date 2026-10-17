# Academic and assignment management

Piece 5 extends the existing Assignments route under Plan and adds Workload Radar to Today. The floating navigation, photographs, core routes, and existing goal work are retained. `AGENTS.md` explicitly requires spotlights, tilt, interactive canvas, keycap press feedback, tabular figures, and reduced-motion support.

## Release dependency

Apply `src/db/migrations/0007_academic_assignments.sql` after migrations 0000–0006 before deploying this version. Do not edit legacy migrations. No live database migration or deployment is performed by this change. No new secrets or environment keys are required.

The migration extends the existing assignment table with course code, item type, optional point weighting, optional estimated minutes, optional work-block start, typed embedded subtasks, revision, and a late-completion flag. Subtasks inherit the assignment's owner RLS policy. Drizzle definitions and application TypeScript interfaces are updated together.

## Completion and lifecycle

`PATCH /api/assignments/[id]/complete` allows overdue completion. Completed work retains the existing `completed` status; `finished_late` produces the **Finished Late** label. PostgreSQL locks the current row, uses its current deadline and the actual completion instant, and writes the completion event atomically. Repeated completion calls return the stored result without duplicate events. Historical completed rows receive the late flag from their stored timestamps. Editing completed metadata preserves its original completion classification; reopening resets the completion timestamp and flag.

Drop is a reversible archive state, not a deletion. Dropped and completed work are excluded from default API results, workload totals, and reminder dispatch. `?status=all` supports the Finished and Dropped archive views. Permanent deletion remains an explicit confirmed action.

`PATCH /api/assignments/[id]` accepts a validated partial payload plus `expectedRevision`. The authenticated security-invoker save function checks ownership, locks the row, validates the entire candidate, and increments its revision. Stale edits return 409. New assignments, metadata, subtasks, and reminder settings save in one transaction.

## Dates and planning

The saved current timezone, then saved timezone, determines local deadlines, today, due-day status, work-block labels, and workload buckets. The server converts local wall-clock inputs in that saved timezone; it does not interpret them using server or browser defaults. Explicit ISO offsets are supported. Nonexistent DST times return an encouraging validation error; a repeated DST hour resolves to its first occurrence. An unchanged deadline retains its original instant when editing another field.

The resolution dock acts on the selected overdue item. **Reschedule** moves its deadline to tomorrow at the same local time; the destination is shown before the action. **Finish Late** completes immediately. **Drop** archives immediately. Reschedule and Drop offer Undo, protected by the returned revision. Custom deadlines and work-block starts are available in Edit. Rescheduling invalidates pending reminders, and dispatch keys include the new deadline so a reminder for the previous deadline does not suppress the new one.

List and Timeboxed Calendar share course/priority filters. List sorting supports earliest/latest deadlines. Calendar work blocks are ordered by start time; unscheduled work appears on its deadline day. A block's end uses its estimated duration and warns if it extends past the deadline. Blocks are planning aids, not claims about actual time spent.

## Workload Radar

`GET /api/assignments/workload` is authenticated and owner-scoped. It covers seven local calendar days beginning today, includes future deadlines within that window, and excludes overdue, completed, and dropped work. Overdue items are reported separately with a recovery link. Hours are summed as integer minutes and converted only for display. Full estimates remain in the workload until the item is finished or dropped; step completion does not invent a remaining-time estimate.

Planning guides are 10 hours per week and 4 hours per day. Warnings appear when either is exceeded. Missing estimates are reported explicitly; unknown hours are never silently treated as a complete zero-hour estimate. Zero is a valid explicit estimate. The widget refreshes on focus, activity, visibility, and every minute while visible. A request failure shows an error or stale-data notice instead of a misleading empty week.

## Verification

- `npm run check`: existing regression checks, academic calculation and API tests, type checking, and lint.
- `npm run build`: production build.
- `npm run test:assignments:db`: disposable PostgreSQL 17 via Docker, without network access or a live database URL. Validates migration repeatability, ownership, late/on-time completion, idempotency, revisions, rollback, metadata, subtask undo, Drop/restore, reminder cancellation, and completion integrity.
- Browser review uses the real assignment and radar components with isolated API fixtures. Authenticated live behavior requires the release migration and a real account.

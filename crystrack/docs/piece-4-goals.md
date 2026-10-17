# Goal tracking and milestone alignment

Piece 4 extends the existing Goals route under Plan. The photo engine, floating navigation, and other routes are retained. Permanent agent instructions are in `AGENTS.md`.

## Release dependency

Apply `src/db/migrations/0006_goal_alignment.sql` after legacy migrations 0000–0005, before deploying this version. It has been tested twice against disposable PostgreSQL 17 for repeatability. No production migration or deployment is performed by this change. No new environment keys are required.

Goal milestones are stored as a typed JSON array on their goal, sharing its owner RLS boundary and transaction. Routine IDs are stored on the goal; database triggers reject routines and financial targets belonging to another user. The authenticated, security-invoker `save_goal_alignment` RPC accepts an explicit field whitelist and locks the goal. PATCH requires `expectedRevision`; conflicting edits return HTTP 409 so a stale panel cannot overwrite a newer check-in or edit. Reflections are required when transitioning to Achieved, Paused, or Let Go. The latest reflection is retained on the goal.

## Progress semantics

Choose one effort source: measured check-ins, equally weighted milestones, or linked routine completions. Milestone completion states, due dates, and titles are editable; dates are saved as calendar keys. Routine progress counts canonical completed occurrences from the local day of linking. Older and future occurrences are excluded, and undoing a task removes its contribution. Changing linked routines, measurement boundaries, or the progress source starts a new pacing baseline. A routine can contribute to more than one goal. Financial progress is presented separately and never averaged with effort. Financial arithmetic converts DECIMAL(12,2) values to integer kobo in `src/lib/money.ts`.

The Goals workspace refreshes on focus and activity events. Changes made elsewhere appear when returning to it; there is no background progress counter to drift. Deleting a goal preserves routines and Wealth targets.

## Dates and estimates

The saved `current_timezone`, then saved `timezone`, determines today, check-in weekdays, calendar deadlines, and completion dates. Date-only deadlines resolve to the final instant of that date in the saved zone, including daylight saving transitions. Weekly check-ins remain available through their occurrence window; the “due today” label is restricted to the chosen weekday. The database locks and revalidates lifecycle, deadline, check-in occurrence, and measured values before persisting a check-in; numeric progress updates in the same transaction.

Pacing uses distinct local days within a 30-day evidence window. Same-day changes, stalls, reversals, and insufficient evidence do not produce a forecast. Positive measured pace projects the remaining days from today. Projections are estimates; life and priorities can change. Paused and Let Go goals display reflective copy rather than forecasts. User decisions determine achievement; no automatic lifecycle change is made from a percentage.

## Validation

- `npm run check`: calculation, API, existing regression tests, TypeScript, and lint.
- `npm run build`: optimized production build.
- `npm run test:goals:db`: explicit disposable Docker PostgreSQL suite; never reads a live database URL.
- Browser review of the actual Goals components with isolated API fixtures: edit, milestone completion, check-in “why,” lifecycle reflections, trophy shelf, mobile overflow, keyboard focus, and reduced motion. Authenticated production data access requires the release migration and a real account.

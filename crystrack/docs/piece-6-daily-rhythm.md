# Piece 6: daily rhythm and mandatory UI audit

## Audit findings and repairs

The prior work did not fully meet AGENTS.md across the application. Goals and Assignments used scoped refractive components, while the shared GlassCard still inherited legacy CSS that explicitly disabled tilt/glare and used saturate(145%) instead of the required 180%. The canvas existed only on those two pages. Shared Today/Plan/Calendar labels still included 9–11px sizes; tabular figures were scoped rather than global. Goal-only and orphaned focus timers did not persist task analytics. These gaps came from leaving the older shared shell untouched during scoped Pieces 4 and 5, not from a requirement to keep it static.

The shared authenticated shell now uses blur(20px) saturate(180%), layered navy/black transparency, hairline gold/white borders, cursor-position lighting, restrained pointer tilt, tactile controls, minimum secondary sizes, and inherited tabular figures. A single cursor/time-phase canvas paints above the retained photo layer and below content. It pauses while hidden and becomes static with reduced motion. Goals and Assignments reuse that shell canvas, and the task-linked Floating Island replaces the goal-only dock. Financial/chart reading surfaces remain solid navy inside the interactive glass frame to preserve contrast. The primary floating bar and all core route names remain intact.

## Rituals

Morning Plan saves up to three owned priorities, occurrence-specific deferrals, and capacity. Today displays the selected priorities; capacity counts the portions of timeboxes that overlap the saved local day. Evening Wrap-up saves wins, a one-line reflection, and pending work to carry forward. Assignment deferrals move the actual deadline to the selected local date at its prior local time; task deferrals move only that occurrence, preserving the recurring schedule. Sunday Weekly Review counts recorded task/assignment/goal completions and completed focus minutes, shows an evidence-based life-area wheel, and saves up to three active focus goals for the next week. Weekly and evening reflections have separate fields.

All rituals are owner-scoped and versioned. Morning/evening saves must match the user's current local day; weekly saves use the Sunday starting that local week. Stale revisions return 409. Reflections and priorities are user-written or chosen; the app does not fabricate wins or measure personal wellness.

## Unified calendar

Day/Week/Month views read `/api/calendar?start=...&end=...` for a bounded range. The grid includes task occurrences and timeboxes, assignment deadlines, dated goal milestones, recurring expense/subscription projections from existing Wealth expected flows, and reminders. Expense projections use `expected_on` as their anchor, clamp a 31st-day bill to month end, and never create financial entries. Irregular/one-off expenses display only on the anchored date.

Drag a task from the rail onto an hour, or choose it and activate an hour button using the keyboard. Each task/day has one movable timebox. PostgreSQL enforces duration, ownership, saved-zone day alignment, and an exclusion constraint against overlapping blocks, including concurrent writes. Adjacent blocks are allowed. Blocks can be removed without deleting the task. The Tasks endpoint and completion flow recognize these single-day blocks and carried occurrences without rewriting a recurring schedule. Ambiguous DST hours use the first occurrence; nonexistent hours produce an explanatory error.

## Focus and analytics

The existing `focus-timer.tsx` is now a task-linked Pomodoro/custom timer in the global Floating Island. Server-backed running/paused state survives route changes and reloads. The server computes elapsed time; the client cannot submit elapsed minutes or write session rows directly. A completed block logs its planned focused minutes and one `focus_completed` event atomically. Completion retries are idempotent; early completion is rejected. Cancelling an incomplete block does not log a completed block. The browser automatically requests completion when the timer reaches zero; a failed save can be retried, and a returning browser resumes the persisted clock. Closing the browser cannot itself issue a completion request; the session is finalized on return.

Per-task analytics read an RLS-preserving aggregate view, avoiding a truncated client-side sum of session history. Daily and weekly summaries distinguish completed focus sessions from paused or cancelled ones. A timer measures a chosen block, not observed attention.

## Dashboard data and cache

Today, Plan, and the dock share a single authenticated `/api/dashboard/today` snapshot in a retained client provider. Today no longer requests six separate endpoints, and its Workload Radar receives the same snapshot. The server cache is bounded, keyed by user ID, saved timezone, and local day, with a 15-second TTL. Responses use `private, no-store` so a shared HTTP cache cannot reuse personal data. Explicit activity refresh bypasses stale entries; new rhythm mutations invalidate the owner's cache. Failed sections are reported as errors instead of silently becoming zero. Calendar range data is fetched separately only on that route.

## Release and verification

Apply `src/db/migrations/0008_daily_rhythm.sql` after the already-applied 0000–0007 migrations before deploying this change. It adds owner-RLS ritual/timebox/focus tables, narrowly scoped authenticated functions, an overlap exclusion constraint using btree_gist, a focus event type, and a security-invoker analytics view. TypeScript DTOs and Drizzle columns are synchronized. Legacy migrations are unchanged. No new secrets are required. This work does not apply live SQL or deploy.

Run `npm run check`, `npm run build`, and `npm run test:rhythm:db`. The isolated database suite uses disposable PostgreSQL 17 without a live database URL. Browser validation uses the actual Today/Calendar/ritual/dock/shared-card components with controlled API fixtures; it verifies the single Today request, glass/spotlight/tilt/canvas, ritual persistence, drag/drop and conflict behavior, views, focus pause/resume and automatic logging, mobile layout, and reduced motion. Live authenticated validation remains a release step after applying 0008.

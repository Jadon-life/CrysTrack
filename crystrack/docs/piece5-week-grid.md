# Piece 5 — Week Grid decisions before implementation

Issue #26 is the specification. The optional `crystrack-final-prompt.md` roadmap is not present in the checkout or supplied attachments for this task; its exact wording cannot be compared. No later main source is used. Base `ccd3d22cf7542edc112fd4945310a1892684b575` and post-merge CI 39246699815 were verified before branching.

- Keep the approved Tasks Today checklist and collapsed routine manager. Add a discoverable Week view beside Today; no Calendar rewrite, sidebar or design foundation changes.
- Sunday–Saturday matches the existing calendar. Use the server's saved scheduling context, calendar-date arithmetic and a bounded range (52 previous weeks, 8 future weeks).
- Past evidence comes solely from the durable daily headers/children. Validate whole-day completeness before any historical cell can claim an outcome. Missing/partial evidence stays explicitly unverified. Activity events and current weekday schedules are never historical evidence.
- Today uses the captured open-day roster, per-routine revisions and the existing desired-status/requestId API. It never claims closed-day streak or +50 credit. Uncertain transports retain the exact request for an explicit safe retry, and refresh authoritative state.
- Future eligibility needs a minimal owner-authorized read over approved schedule versions, respecting effective dates, enabled state, weekday rules and start/end bounds. It is labelled planned/editable and never stored as an occurrence. Timezone transition gaps remain unavailable, not verified empty.
- Add a local-only `0017` read RPC candidate with a pinned token covering both daily outcomes and schedule versions. It returns 25 routine rows × seven dates, complete day summaries and keyset paging; it introduces no tables, grants to write, outcomes or reward rules. Existing RLS and maintenance/Preview boundaries remain.
- Filters: current active routines, all routines represented this week, and routines with earlier captured rows this week. History does not imply verified outcomes; each cell still checks its day evidence. Retired/deleted names come from trustworthy frozen metadata; uncertain names are labelled honestly.
- Use a semantic table with sticky row labels and column headers inside one labelled horizontal scroll region. Keep text >=12px (body >=14px), actions >=40px, visible focus and reduced motion. Paginate rather than mounting hundreds of interactive rows.

Issue #18 remains the hosted release gate. Candidate migrations 0016/0017 stay local-only; hosted history, numbering and compatibility are UNKNOWN. No hosted Supabase/Vercel/production/main changes or deployments are authorized.

## Implementation contract

The new `daily_read_week` RPC calls the existing owner-locked `daily_context` for the same bounded closure/materialization recovery as other daily reads. That established recovery may book genuine elapsed closed-day rewards through existing triggers; this feature adds no other mutation or reward authority. It never materializes a future date. Full header/child count and conflict checks happen before row paging, including days with more than 1,000 children.

The pinned token covers context, daily data revision, schedule-version count, week and filter. Definition capture appends versions under the same owner lock, so changing tomorrow's schedule invalidates a cursor even when today's outcomes are unchanged. A conflict refreshes the first page instead of mixing snapshots. Default page size is 25 (RPC hard maximum 50); rows are sorted/keyset-paged by durable UUID. Active definitions and represented durable/future identities form the row set. No mutable definition FK is required for history.

Verified old cells keep their frozen title. Row labels identify whether they use a current, recorded, planned or unverified name. A different frozen title is visible inside its cell. Partial *past* days expose no status or membership claim. Clean, captured *today* children can still be changed on an installation/partial day and are explicitly provisional; a conflicting child cannot be changed. Past/future columns never have action controls.

A lost write response retains its original desired state, revision and request ID for explicit replay. No blind toggle/revision guessing occurs. New actions wait until the person retries or accepts the refreshed status. Conflicts and midnight closure refresh the authoritative grid; focus returns to the available action/refresh control. Account changes remount the private view; canceled/older reads cannot publish into the new view.

The Tasks Today list/routine manager remain default and unchanged in composition. Their completion/skip error paths now also refresh and invalidate the week after ambiguous writes. The new view uses an ordinary semantic table, not an incomplete ARIA spreadsheet. One scroll region handles both dimensions, sticky labels/headers preserve context, keyboard focus exposes offscreen Today actions, and only 25 routine rows mount at once. `axe-core` is a pinned dev-only browser test dependency; no runtime dependency or calendar framework was added.

Preview uses only bundled fictional data for the new read route. Client writes remain disabled and the existing middleware denies every Preview writer; the existing `/api/tasks` maintenance prefix also covers `/api/tasks/week`. No Vercel flag or configuration is touched.

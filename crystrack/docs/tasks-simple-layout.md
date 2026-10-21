# Tasks page — simplify and collapse All routines

- The Tasks page now uses a compact, grouped Today checklist with a real completion ring, not twenty separate oversized cards.
- Check/untick and skip/unskip continue to call the existing task APIs. Skipping remains available on mobile.
- Completion reflects actual scheduled routines; a skipped routine never counts as completed.
- "All routines" stays on the Tasks page but becomes a native collapsed disclosure, closed by default. It shows the total routine count, and opens to the existing weekday filters, schedules and archive/delete controls.
- The New task button is always accessible at the top; the existing create modal remains unchanged.
- Existing September 28 colours, scenic wallpaper, horizontal navigation and theme tokens are preserved.
- The Today dashboard keeps its separate Undo feature; this Tasks-page pass reuses the existing toggle/skip actions and does not introduce new database behavior.
- History navigation was not altered. Product recommendation is to de-emphasize the History page in favor of Insights/Progress Reviews while retaining all audit events. Await user confirmation before hiding it.
- No migrations, database edits, financial writes, production merge or test interactions with unverified hosted Supabase.

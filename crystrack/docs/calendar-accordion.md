# Calendar UI refinement — compact month and expandable days

- Original September 28 appearance, glass, colours, horizontal nav and recurring schedule logic preserved.
- Date cells show only the day number and small coloured dots for routines, assignments and goals.
- Desktop hover gives a four-item preview. Click/tap selects a date; full information appears in the existing details side panel.
- Each category in the day details is a native collapsed disclosure with counts, and expands to show all entries in that category. No long task list inside the month grid.
- Month navigation, empty day states, and links to Plan remain.
- Existing read-only task, goal and assignment endpoints only; no new calendar tables, bill integration or financial writes.
- Static regression tests included. Manual browser checks for hover positioning, mobile and keyboard navigation remain necessary.

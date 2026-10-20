# Issue #39 — inspect first: Calm Today and Wealth

Base: remote `65bd0807a6f41921b2fb0d176fb66d6a17b2dbae`; both post-merge CI
39345147461 jobs verified green before branching `feat/piece7a-calm-today-wealth`.
Read #39, #37 follow-ups and independent PR #38 review. No new blocking finding;
hosted compatibility/backup/performance and #18 remain unresolved release gates.
No AGENTS.md is present. No post-September-main source fetched or imported.

## Actual unchanged signed-in capture

Captured before application edits using the normal optimized development-head
artifact, guarded disposable Docker, same persistent synthetic owners/records
for the after run. Seventy screenshots: Today/Wealth at five widths in physical
Light and Dark modes over the bright scenic image; plus budget over-limit,
bills due/overdue/paid source, bill consent cancellation, unavailable finance,
missing FX, unverified history and empty-account screens at each width.
Both financial/shard/durable routine hashes stayed unchanged during navigation,
inspection, theme changes, consent cancellation and same-context account switching.

| Width | First Today task control Y, dark | Wealth document height, dark |
| ----- | -------------------------------: | ---------------------------: |
| 375   |                           826.09 |                         4354 |
| 430   |                           750.59 |                         4250 |
| 768   |                           782.59 |                         3848 |
| 1280  |                           552.50 |                         2250 |
| 1440  |                           552.50 |                         2223 |

The viewport is 812px tall for every comparable capture. Full before measurements
and pixels will be committed with final validation evidence.

## Specific usability inventory

- Four tall summary boxes precede the actual checklist. The 375px first task
  control is below the viewport. Two urgent assignments sit below streak,
  goals, Wealth and the entire calendar. Streak detail/legends have equal visual
  weight to immediate work. Calendar preview and Week grid need distinct labels.
- Wealth has three equally prominent header actions, a wrapping FX explanation,
  five equal KPIs, four fully expanded analysis cards, empty expected money,
  debts, targets and fourteen recent rows. Available money competes with
  secondary forecasts and repeated descriptions. Header/FX text over a bright
  photo and 30px currency controls need stronger reading surfaces/touch targets.
- Bills' heading contains repeated reassurance, a long forecast paragraph and
  month-end/provenance explanation before the first actionable bill. Planned
  ranges and overdue status are useful and must stay visible.
- Exact/approximate controls, complete-ledger month/zone stamp, missing-FX and
  unavailable states already carry important truth. They must stay visible and
  functional; collapsing them into a hidden analysis panel would be a regression.
- CSV preview/mapping/currency/duplicate/confirmation safeguards are already
  substantive. No import or payment decision needs fewer approval steps.

## Smallest hierarchy to implement

1. Today: compact real greeting, checklist first, urgent deadline link/count and
   assignments ahead of calendar/secondary content on mobile. Keep verified streak
   visible but secondary. Put the existing four summaries behind Day overview;
   goals/calendar/activity use named disclosures. Keep Wealth failure visible.
2. Wealth: Available + monthly Net cashflow primary. Saved/safe-to-spend/net-position
   remain under Balance details. Add visible review shortcuts to existing Budgets
   and Bills tabs and actual due debt; do not invent budget/bill counts from an
   Overview DTO that does not contain them. Do not add API calls or materialize
   more bill occurrences to decorate the Overview. Existing tab warnings and
   guarded actions stay one clear navigation action away.
3. Secondary cashflow/pattern/AI/forecast cards go behind Spending insights &
   forecast. Expected plans, savings goals and longer recent rows use descriptive
   disclosures. Debts and recent actual money stay easy to find. All exact values,
   charts, readers, currency controls and editing modals remain intact.
4. Bills: one always-visible no-auto-charge/explicit-confirmation sentence;
   contextual help holds the existing longer planning/month-end/provenance copy.
   Paid confirmation UI and all handlers remain unchanged.
5. Use one small native-details component with explicit expanded state, keyboard
   focus, >=40px summaries, measured reading surfaces and reduced-motion chevron.
   No new packages, migrations, endpoints, financial arithmetic, auth, RLS,
   reminders, reward accounting, theme switch or global navigation rewrite.

After validation, document actual height/control-position deltas and any retained
accessibility/hosted limitations. All production operations remain prohibited.

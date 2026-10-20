# Issue #39 — Calm Today + Wealth validation

Source: verified green development head `65bd0807a6f41921b2fb0d176fb66d6a17b2dbae`,
post-merge CI [39345147461](https://github.com/Jadon-life/CrysTrack/actions/runs/39345147461).
Feature branch: `feat/piece7a-calm-today-wealth`; development-only draft review.
Read Issue #39, #37 follow-ups and PR #38 independent review before changes.
No post-September main code was used.

## Changes and boundaries

Today puts the actual checklist first, keeps urgent assignment navigation visible,
and moves overview summaries, calendar, goals and activity into named disclosures.
The verified streak and navigation crystal indicator remain visible. Calendar and
Tasks Week grid are explicitly distinct. A failed task read is now visibly unknown,
rather than an empty schedule or assumed zero progress. Wealth retains its visible
failure state and exact available money.

Wealth prioritizes Available and monthly Net cashflow, a clear review shortcut for
Budgets/Bills and actual due debt, open debts and four recent entries. All fourteen
recent rows are one named expansion away; full history remains in CSV tools.
Savings, expected plans, balance details and secondary analysis remain available
without filling the initial screen. The saved-zone/all-record status, inspectable
approximate totals and unavailable/cached FX warnings remain visible. No budget or
bill counts were invented and no new Overview fetch/materialization was added.
Bills retain one visible no-auto-charge/explicit-confirmation warning, with longer
planning/month-end help behind native details. Payment and import consent stay intact.

A small native-details component provides meaningful names, expanded state,
keyboard access, visible focus and reduced-motion feedback. Children mount after
opening so Recharts measures a real container. Existing chart SVGs now have text
alternatives, exact category labels and an accessible exact-NGN cashflow table;
the existing icon-only AI refresh button now has a name. No new AI calls.

Financial/API/database/auth/navigation/theme sources are unchanged: see
[source-invariants.json](validation/issue39/source-invariants.json), with **113
byte-identical core files and 14 identical normalized action-handler AST hashes**.
No migrations, dependencies, locks, source records or financial formulas changed.

## Executed local validation

- `npm run check`: **211/211** application tests; TypeScript passes; ESLint zero
  errors with the same four existing background/image/physical-switch warnings.
- Guarded fresh disposable-local reset plus full integration suite: **122/122**,
  zero failures/skips. RLS, owner isolation, task transactions, shards, bills,
  CSV provenance, exact reports and timezone regressions remain covered.
- Normal optimized `npm run build`: pass. Local Node 24.19; unchanged CI uses Node22.
  Existing frozen-install dependencies reused; no package or lockfile edits.
- Local synthetic Preview: **12 routes, all 40 writer routes**, no external
  requests/runtime errors, credential markers absent and missing-mode fail-closed.
- Maintenance barrier: **55/55** method probes denied before authentication,
  ordinary sign-in still accessible.
- New signed-in paired Chromium suite: **pass at 375/430/768/1280/1440**, physical
  Light/Dark over the same bright scene, normal optimized artifact, real local Auth.
  **70 before + 85 after screenshots**, including five combined-journey captures.
- **30 scoped axe analyses** pass across Today, collapsed Wealth and expanded
  analysis in both themes at every width. Manual conservative white-backdrop
  contrast calculations and >=40px checks cover new disclosure/currency/urgent
  controls; all pass. This is scoped evidence, not whole-app WCAG certification.
- Nine retained signed-in browser regressions and exact-head GitHub CI are being
  completed; their final outcomes will be recorded before review handoff.

The 375px journey completes/undoes/skips/undoes a routine, opens Tasks Week grid
and Assignments, keyboard-inspects an approximate exact-money dialog (Escape
restores focus), reviews an over-limit budget, pays a synthetic bill only after
consent, corrects/excludes CSV rows, confirms/imports two transactions, exports
all five exact records and returns to Today. Selecting a file and a payment
without consent cause no write. Historical CSV adds no shards.

Two separate comparison owners retain the exact same financial, savings, debts,
budgets, bill occurrences/provenance, CSV, shard and durable daily-record hash
before and after navigation, disclosures, theme changes, cancellation and
same-context account switching:
`2069a6c61c9180e2a67b01af7d1d74409cb000d523cc7ca911487e98701e4c6c`.
Explicit writes occur only in a third synthetic journey account and cannot affect
either comparison owner. The established owner has **2,009** actual local ledger
rows, exact available **17514.55** and current expense **2505.50**, unchanged.

| Width | First Today task Y: before → after | Default Wealth height: before → after |
| --- | ---: | ---: |
| 375 | 826.09 → 495.59 | 4354 → 2082 |
| 430 | 750.59 → 475.59 | 4250 → 2026 |
| 768 | 782.59 → 491.59 | 3848 → 1871 |
| 1280 | 552.50 → 435.00 | 2250 → 1552 |
| 1440 | 552.50 → 435.00 | 2223 → 1552 |

All pairs use the same accounts, rows, 812px viewport height, fixed browser time,
New York browser versus saved Lagos schedule, bright photo and reduced motion.
At 375px the first control moves up **330.5px** and default Wealth height falls
**52.2%** without deleting functionality. Urgent anchors focus/scroll correctly;
no body horizontal overflow, clipped amounts or zero-width expanded charts.

## Evidence and reproducibility

[Pre-change usability inventory](piece7a-ux-audit.md),
[actual screenshot index](screenshots/issue39/README.md),
[raw sanitized validation logs and machine-readable results](validation/issue39/).
Run `node scripts/test-calm.mjs --phase=before` against the baseline normal artifact,
then `--phase=after` against the feature normal artifact, **without resetting** the
comparison sandbox. The private synthetic credentials stay ignored under
`.preview-test`; they are never included in evidence. Guarded Docker project,
loopback ports and no-linked-project policy are mandatory. No target URL overrides.
Retained browser suites must run sequentially because they use private local clocks.

Initial tests caught a denied fixture DML (corrected to the authorized assignment
RPC), an existing unnamed AI icon button and unnamed pie-sector SVGs (now explicitly
labeled). Screenshot review caught wrapping Add actions and cached-rate visibility;
these were corrected and the full paired run repeated successfully. An initial
local startup/reset overlap was stopped; only after startup completed was the
fresh guarded reset/integration suite run successfully. No database guard was bypassed.

## Limits and release boundary

No hosted query, real financial record, external AI provider, Vercel setting,
Preview activation, deployment or production migration was accessed/performed.
Normal signed-in browser runs block external transport; some requests are attempted
by retained app integrations and are blocked locally. Synthetic Preview makes
zero external requests. Hosted schema, production authentication/provider
connectivity and real-owner performance remain unverified. No hosted isolation is
assumed. Four pre-existing lint warnings remain. Cross-browser/manual screen-reader
certification and the separate AI/privacy/offline work are out of scope.

**Issue #18 remains a hard production release blocker.** No migration is required
by this presentation-only PR; existing local bootstrap candidates were used only
in guarded disposable Docker. No hosted migration history was inferred. All data,
CSV and screenshots are fictional local fixtures. Draft PR only; independent
review is required and no self-merge or live release is authorized.

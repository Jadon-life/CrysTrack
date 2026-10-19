# Issue #35 — Wealth money presentation

Base: verified remote Sep28 dev `76a0556a70e0365b3063645428893c6978d9c46d`;
both jobs in post-merge CI 39300895230 passed before branching.

## Policy

`src/lib/money-presentation.ts` is the active display/input policy; it never
supplies an accounting value to a writer. Exact decimal strings use the existing
integer-kobo helpers. No SQL, schema, route, calculation, threshold, provenance,
reward, exchange quote or authorization change is required.

- Everyday NGN: `2500.00` → `₦2,500`; `2500.75` → `₦2,500.75`.
  Real kobo stays visible wherever a person chooses, pays or reconciles a value.
- Overview summary: `2500.75` → `≈₦2,501`. The dotted amount is a >=40px
  keyboard/touch trigger opening an accessible exact-NGN disclosure. Rounding
  uses integer half-up on magnitude. Rounded figures are never added together.
- Statement/reconciliation: the existing `exactMoney` helper, CSV parsers and
  exporter are unchanged; two decimal places and exact source strings remain.
- USD stays explicitly indicative (including `$1.00` or `$0.00` after conversion).
  Details identify canonical NGN; unavailable quotes fall back to labeled NGN.
- Manual entry: whole-naira examples, no forced `.00` in edit prefills. Optional
  two-place precision remains accepted and is explained; no new rounding on save.
- Original dashboard aggregates still arrive as Number. A display-only bridge
  expands their decimal representation and rounds sub-kobo drift with BigInt,
  visibly marking it approximate; disclosure calls it existing numeric summary
  precision, not an exact ledger total. Unsafe/nonfinite/unavailable inputs show
  `—`, never a fabricated zero. This does not repair or rewrite legacy arithmetic.

All active Wealth/Today money surfaces use the central policy. Unused legacy
`formatCurrency` / `formatWealthMoney` exports are left untouched to preserve
contracts and keep financial core code unchanged; no UI imports them now. Compact
abbreviations are removed from money labels so significant digits are inspectable.
The existing dashboard composition, scenes, navigation, physical switch and
financial writes remain approved September implementations.

## Validation / boundaries

See the accompanying validation report for executed counts, exact logs, synthetic
screenshots and final-head CI. A first validation attempt identified bigint syntax
incompatible with the TS target; it was changed to `BigInt(...)`. A proposed import
into the legacy financial module exposed its standalone integration-test loader;
that change was removed, keeping the financial module completely untouched. The
full database suite is rerun after a guarded local reset, without weakening tests.

No new migration. The existing 14-file local bootstrap through 0020 is reused only
inside guarded loopback Docker with fictional owners. No hosted Supabase, Vercel,
Preview activation, deployment, production/main changes, paid resources or merge.
Issue #18 remains a hard release blocker. Broader legacy accessibility and
Number-based aggregate precision are outside this presentation-only PR.

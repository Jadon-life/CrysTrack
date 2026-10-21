# Issue #37 — pre-implementation contract / invariant inventory

Verified remote dev 326be53606dddac5fdd192ed4460d6eaaed6821e and BOTH green
post-merge CI 39340785211 before branching feat/piece6e-exact-overview. Read #37
and its follow-up. No main fetched/imported. No AGENTS.md is present.

## Existing meanings retained

All ledger amounts are positive canonical NGN NUMERIC(12,2). Flow kind falls back
to type only when NULL. Available = income + borrow + receivable_repayment +
savings_release - expense - saving - lend - liability_repayment; transfer = zero.
Saved = max(0, sum(saving - savings_release)). Targets are not a second balance.
Open debt outstanding gives receivables/liabilities; settled debt contributes zero.
Net position = available + saved + receivables - liabilities. Negative available/
net is legitimate. No absolute-value normalization or source rewriting.

Current saved-zone month actual income/expense/saving-release are separate.
Month saved = max(0, saving-release); net spendable = income-expense-month saved.
Savings rate = month saved / income * 100 (NULL when income <=0). Average daily
spend = actual month expense / elapsed saved-local calendar day; projected expense
= month expense * days in saved-local month / elapsed day. Prior expense = prior
saved-local month. Projected change compares projection with prior expense, NULL
when prior expense is zero; velocity >=15% elevated, <=-15% low, otherwise normal.
Percentages/projections are estimates, never actual ledger movements.

Expected ranges: active only, suppress once last confirmation falls in current
saved-local month. Weekly count max(1,ceil(inclusive remaining calendar days/7));
monthly/irregular =1; one-off undated=1 or dated in this month=1; quarterly/yearly
require a date in this month. Multiply min/max (NULL max=min) by count. Preserve
this legacy forecast model; no new recurrence or overdue semantics. Due open
liability = undated or due before next saved-local month starts (includes overdue).
Safe to spend = max(0,available - expected expense max - due liability). Month-end
low/high = available + expected income min/max - expense max/min - due liability.
Recurring bill plans/occurrences are deliberately NOT forecast inputs (#30);
paid bill expense is counted once as an actual. Confirmed expected receipts are
actual ledger movements and current-month confirmation suppresses the forecast.

Category current = actual expense by trimmed category (blank Other); baseline =
mean over latest three observed prior expense months, absent category=zero.
Previously non-current future months accidentally entered historical baseline;
unverified future actual dates now fail unavailable, never silently reclassified.
Projection uses local month days/elapsed; compare rational values before rounding
threshold signals. Historical dates/months with records are not invented.

## Read authority / exactness

New additive LOCAL-ONLY 0021 (verified unused) is a read-only authenticated owner
RPC, no caller owner/date override. One STABLE statement snapshot captures saved
zone, clock, all ledger month/kind/category SUM(NUMERIC), record counts, bounded
recent 14 entries and complete side collections. No 2,000-row authority or raw
unlimited browser ledger. Snapshot isolation avoids mixing debt/source commits.
Financial source ownership and protected bill/CSV provenance must be coherent;
invalid/undated/nonfinite/nonpositive/unsupported/future actuals fail unavailable.
Do not invent debt reconciliation equations for legacy standalone debt fixtures.

All authoritative money becomes decimal strings / BigInt kobo. Actual sums are
exact. Derived projections/baselines round half-away-from-zero to kobo ONLY for
serialization; ratios/threshold signals use unrounded integer rational operands.
Plots alone may convert exact strings to Number; tooltips use original strings.
No rounded display or graph value feeds a balance or writer. Central #35 policy
receives exact strings; forecasts are labeled projections. No financial writes,
reward backfill, reclassification, source edits, RLS relaxation or paid resource.

Scheduling zone = coalesce(profiles.scheduling_timezone, timezone, UTC), same as
0018/0020; invalid configured zone fails, not silently substituted. current_timezone
is not a financial fallback. A saved-zone change re-buckets existing instants on
fresh read; it never rewrites ledger history. Day/month/previous month/month end,
DST/leap, confirmation/date-only expected dates and six-month cashflow all use it.

Safety bounds apply to RESPONSE cardinality/bytes, never silently cap source sums:
<=12,000 grouped month/kind/category buckets, <=10,000 per side collection, <=8 MiB
internal snapshot and <=4 MiB response; unsupported exact magnitude/coverage fails
as a whole. Ledger COUNT and bucket counts must reconcile. Recent list labeled 14
of total, deterministic date/created_at/id ordering. No stale server cache; private
no-store. Temporary failure clears stale amounts and never displays fabricated zero.

## Consumers / matched DTO migration

GET /api/wealth feeds Wealth and Today; former raw entries now mean recent-only,
with explicit reporting metadata and complete exact summary/cashflow. Wealth
cashflowSeries no longer re-aggregates browser records. Charts receive serialized
six-month totals from the same snapshot. Targets/debts/expected retain original
field names but monetary fields are strings. Today savings and Wealth excerpts
stop Number conversion/zero failure fallback. Focus/visibility/day rollover refresh.

POST /api/wealth/insight uses the same snapshot and coarse sanitized signals.
AI wealthContext currently caps at 12,000, slices ISO months and sums floats;
replace that wealth-specific read with the same verified summary/month ledger.
Only compact aggregates and allowed dates/kinds/categories/amount strings go to
AI; no line-item source/description/note/reference/account or debt counterparty.
No unrelated AI, auth, UI shell, financial writer, budget/bill/CSV API rewrite.

## Safety gate

Only isolated disposable loopback Docker, synthetic owners and fixtures. Existing
0015 shard, 0018 budgets, 0019 bills, 0020 import/export source protections remain
unchanged. Additive RPC migration has strict grants and no new public table; all
existing user tables retain RLS. Hosted numbering/schema/backup UNKNOWN; #18 blocks
release. Full app/DB/eight retained+new browser workflows/Preview/55 maintenance/
build/CI, synthetic evidence, pushed draft dev PR; no merge/deploy/Vercel/hosted DB.

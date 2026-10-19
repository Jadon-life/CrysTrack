# Piece 6B — decisions before implementation

Issue #30 is authoritative. Verified exact remote head
`ee0cc9eb1854c695e2f08394a99726ad5e8182d2` and green post-merge CI 39273791924
before branching from FETCH_HEAD. No main fetched/imported. No AGENTS.md or
original final-prompt roadmap found. Reuse the existing guarded free local setup.

## Sources, forecasts and real payments

Bills are a separate, namespaced planning source. **Never create, update or mirror
wealth_expected_flows.** Existing confirm_expected_flow is not idempotent enough
to serve as bill payment authority; do not call or rewrite it. There is no
existing bill_id column at this approved revision. Add explicit bill/occurrence
provenance to money_entries so the original 0015 origin checks suppress bill
spending rewards permanently. Do not rewrite that reward trigger.

Bill plans appear only in Bills, with exact planned totals. **They are not added
to Overview safe-to-spend or month-end forecasts**, which remain the existing
Expected money calculation. This is explicit in UI: no duplicated projection
row or second deduction, and no claim that Overview includes bill obligations.
Do not track/confirm the same obligation again through Expected money. Automatic
matching or adoption of legacy expected flows would be unsafe without owner intent
and is outside this piece. No inference from matching merchant/title/amount.

Explicit confirmation of one due occurrence writes one real NGN expense, one
financial activity record and payment proof atomically. Actual amount is explicit
and may differ from the estimate; timestamp is server payment time, not due day.
Monthly Budgets sees that single actual expense, while unconfirmed bills do not
count as spend. Payment provenance is immutable, including direct authenticated
ledger writes; no clearing bill_id, editing or deleting payment rows to resurrect
reward eligibility. No undo/refund is fabricated. Pause/cancel never reverse a
real payment; genuine refunds can be recorded separately through existing Wealth.

## Calendar, history and concurrency

Weekly/monthly/quarterly/yearly anchored dates. Clamp 29–31 to shorter month's last
day, then return to original anchor; Feb 29 yearly returns on the next leap year.
No elapsed-hour recurrence math. Due dates use the saved scheduling zone. Paid
snapshots retain due date, title, expected/actual amounts and payment instant.
Unpaid future plans follow edited definitions/zone; old overdue/today snapshots
are retained. Schedule changes start tomorrow or later. Pausing keeps unpaid
history; resume retains missed obligations. Cancel is terminal and never silently
reopens. Paid occurrences are never replaced by edits or rescheduling.

One occurrence per bill/due-date and one expense per occurrence, owner lock,
revision checks and durable request receipts. Lost responses replay the identical
request; stale context is reread rather than blindly retried. No auto-debit.
Materialize anchored due plans through 30 days ahead; initial due is bounded to
one year before/after today. Recovery is bounded to 4,096 occurrences per bill;
if exhausted, report not confirmed instead of silently dropping older obligations.
Page owner definitions and due history; aggregate all owner plans, not 2,000 rows.

## Reminders and release

Opt-in only, due-day 09:00 in saved zone, via the existing dispatcher and existing
Push/Telegram adapters. No new cron/job/Vercel setting. Claim under the same owner
lock as payment/pause/edit/cancel; recheck settings/DND and pending source.
One stable delivery key per occurrence. **At-most-one delivery attempt**, not a
false exactly-once claim across external network failures: missing integrations
or ambiguous delivery stays not confirmed and is not auto-retried (avoids duplicate
notifications). Already in-flight delivery cannot be recalled. No email channel.
Only local candidate SQL/dispatcher extension; hosted scheduling remains blocked
by #18 plus explicit future approval, backup/rehearsal/compatibility review.

Current migration inventory ends at 0018. Add candidate 0019 only locally with
synchronized models/DTOs. No hosted queries, migrations, Vercel access, deployment,
main edits/merge, paid resources or Issue #31 import/export work.

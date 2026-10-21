# Wealth currency UX — NGN/USD display switch and source input (Issue #78)

## Product requirement

There is NO separate calculator. The existing header toggle ₦ NGN / $ USD changes displayed money for Wealth's overview, budgets, bills and related balances. For example, ₦30,000 Food budget displays ≈$18.75 at an illustrative $1=₦1,600 rate; the original limit remains ₦30,000.

Money entry, monthly-budget editor and bill/subscription authoring now provide an input currency selector. USD inputs are converted at a current validated reference quote before sending existing NGN-only accounting requests. For example, $30 subscription becomes ₦48,000 using illustrative rate ₦1,600/USD; the reverse toggle at that same rate shows approximately $30.

## Safeguards and limitations

- Every authoritative ledger/budget/bill amount remains NGN; no bank exchange is performed.
- Conversion uses BigInt cent arithmetic, fixed-point quote, half-up kobo rounding. Missing, invalid or stale USD quotes block USD writes. NGN input is unaffected.
- Switching input units clears rather than silently relabels an amount. Existing bill plans open for editing in NGN to prevent source confusion.
- For money entries, original USD amount and quote are added to the existing note. For monthly budgets and recurring bill plans, only the converted NGN is saved. Without original-currency provenance columns, the toggle's future USD display **will vary when rates change**; it is an indicative valuation rather than a promise the original dollar subscription stays exactly $30.
- Durable USD-denominated recurring obligations require a separate explicitly designed schema for original currency/amount, quote, timestamp, spread, actual-payment policy and source revisions. Do NOT present this UX as that more advanced capability.
- Synthetic read-only Preview continues to block all hosted writes. No migrations 0013–0024 changed and no live DB or Vercel production settings changed.

After the PR passes exact-head tests, TypeScript, lint/build, Chromium and review, merge only to the September development branch. Refresh main PR #73 to the new exact tree, revalidate its CI separately before any main merge.

User requested skipping the private backup. That does not make hosted PostgreSQL 17 data migration recoverable. Live CrysTrack contains three accounts, 16 tasks, 408 occurrences and two Storage files. Do not reset or destructively alter it to make a fast cutover.
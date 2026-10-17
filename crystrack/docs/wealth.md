# Wealth suite — Piece 7

## Accounting contract

All stored amounts and account opening valuations are NGN `DECIMAL(12,2)`. `money.ts` parses decimal strings into integer kobo, rounds division half away from zero, and serializes exactly two decimal places. Arithmetic, allocation, forecasting and ratios run on integers. Numeric values returned by the legacy summary or charts are presentation boundaries, never intermediate accounting values.

Cash, Bank, Savings and USD Wallet are ledger accounts. USD Wallet explicitly stores an NGN valuation; the USD toggle converts that valuation using a timestamped indicative rate. This app neither holds money nor executes foreign exchange. The reference USD view is not an inflation/CPI index. Opening balances must cover only money absent from the existing ledger. Existing entries are backfilled into Cash without changing their totals. A transfer debits one account and credits another, with no spending or income impact.

`0009_wealth_suite.sql` adds owner-only RLS tables and transactional ledger guards. Entry revisions prevent stale edits. Soft removal and its ten-minute undo reverse/reapply target and automatic savings allocations together. Removing or reducing protected savings is rejected until the unlock day in the saved profile timezone. General releases cannot spend assigned target funds. Debt and confirmed expected-flow entries remain managed through their originating flows to preserve their accounting invariants.

Spend & Save uses integer basis points (100 = 1%). Each new expense captures its rate. Its derived savings entry is updated or reversed with the parent expense. Settings changes apply to future expenses. Imports also follow this rule. A protected child allocation can prevent removing or reducing its parent expense; the UI surfaces a recovery message.

Category reallocations serialize writes and preserve the total cap. The source cannot fall below recorded category spending. Unassigned monthly income is shown explicitly; zero-based planning aims to allocate it to zero. Left to Spend Today is constrained by both category room and available ledger balance.

## Projections and dates

Runway uses the seven saved-zone calendar days ending today, excludes transfers/savings, and divides unrounded total spending by seven. Zero spending yields no estimated exhaustion date; negative available balance yields zero days. Forecasts include expected income ranges and scheduled recurring charges, with 30/60/90-day daily balances. They exclude unscheduled spending/income. Avoid entering the same charge as both a recurring bill and expected money. Monthly recurrences keep their original anchor across short months. Low-balance warnings are estimates, not guarantees.

Bills appear in Wealth's upcoming charge list and the existing Day/Week/Month calendar. “Record paid” creates an expense atomically; removing/undoing it restores/advances the charge reminder. Ajo/Esusu is a personal tracker: fixed per-turn contributions, member order, contribution logs and scheduled payouts. Logging a contribution does not move money or automatically create a ledger transaction.

## Statements and exports

CSV preview supports BOM, quoted commas/newlines, escaped quotes and CRLF. Supported headers: `Date,Description,Amount,Type` or `Date,Description,Debit,Credit`. Dates must be unambiguous `YYYY-MM-DD`. Uploads are limited to 1 MB and 500 rows per batch. Categories can be corrected before import. Nigerian merchant matching suggests Food, Transport or Transfers & Banking; a bank name alone does not establish an expense purpose.

Same account/date/direction/amount/source is a possible duplicate, including within a file. Preview excludes matches; the server recomputes fingerprints and the database enforces uniqueness under a transaction. Intentional identical transactions can be recorded individually. CSV exports escape cells and neutralize spreadsheet formulas; JSON includes account/configuration data. Both include removed ledger entries with their deletion timestamps for a complete audit trail. Downloads remain private.

## UI audit and verification

The shared shell already implements one time-of-day ambient canvas over retained photos, cursor spotlights, blur(20px)/saturate(180%), tilt/glare, tactile controls and reduced-motion behavior. The Wealth page retained its older `CreateModal` and overly opaque dialog tint, float chart aggregation and browser-local month logic because previous pieces changed their own features and shared surfaces. Piece 7 replaces those forms with the accessible glass dialog and restores its prescribed translucent tint, integerizes Wealth aggregation, and uses the saved timezone. All data tables and charts retain opaque navy inner surfaces within interactive glass cards. Currency displays, forecast tables and budget matrices use tabular numerals; body/secondary text floors remain 14/12px.

Run `npm run check`, `npm run build`, and `npm run test:wealth:db`. The latter starts only a temporary, network-isolated PostgreSQL container and applies migrations there. It does not touch Supabase. Apply new migration `0009_wealth_suite.sql` to the live database separately, after reviewing it. No new secrets are required; the existing optional `EXCHANGE_RATE_API_KEY` uses the configured open provider fallback when absent.

## Recovering an incomplete SQL Editor paste

`ERROR 42601: unterminated dollar-quoted string` at `wealth_guard ... AS $$` means the submitted function body has no closing dollar quote. A paste ending at `IF NEW.flow_kind='transfer' ... THEN;` is incomplete: the migration continues with the transfer validation and several further functions, ending at `COMMIT;`. Do not fix this by adding a closing `$$` to the truncated text.

Run `ROLLBACK;` separately to clear any failed transaction. Open a fresh SQL Editor tab, paste the entire `src/db/migrations/0009_wealth_suite.sql` file (246 lines, from its opening comment through the final `COMMIT;`), clear any text selection, and run the entire script. Remove any generated `-- Added by Supabase` suffix; the migration already enables RLS on all six new tables. In particular, `zone` and `NEW.account_id` are function variables/fields, not tables.

The migration is safe to retry as a complete script and is tested twice against a temporary PostgreSQL database. It must be applied after migrations 0000–0008. A failed paste does not require dropping tables or modifying earlier migrations.

For repeated copy/selection errors or `function wealth_guard() does not exist`, use the [numbered SQL Editor installer](sql/wealth-0009/README.md). It keeps every function complete and installs dependencies in order.

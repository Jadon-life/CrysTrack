# September 28 database compatibility — Preview only

Base: `restore/crystrack-september-28-2026` (`28de0d7`), preserving historical application source `83b83542f27e1ff700248fcdb359891fb461c472`. Work branch: `fix/september-28-database-compatibility`. Target the existing `crystrackbeta` project only. Do not merge to main or promote production.

## Findings and fixes

- **Double target adjustment:** September inserted a savings entry and called `adjust_target`/`increment_target`; 0009's trigger already owns the adjustment. Both entry endpoints now delegate once to the transactional ledger, without either legacy adjustment.
- **Duplicate activity:** 0009 emits finance activity inside its transaction; the API no longer appends another finance event. Likewise, assignment completion delegates its event/reminder cancellation to 0007. Goal check-ins leave the single progress update to 0006.
- **Transfers:** missing/same/foreign accounts are rejected. The existing entry modal now includes explicit source/destination selection and an inline account form, with zero opening balances. No destination is invented. All accounts, including USD-wallet labels, retain the existing NGN ledger semantics.
- **Deletion/edit/undo:** `PATCH`/`DELETE /api/finance/entries/[id]` require the current `expectedRevision`, call the controlled ledger RPC and preserve tombstones, locks, derived savings and the existing undo window. No hard-delete privilege is restored.
- **Account overdrafts:** 0009 does not prevent negative account balances. New additive migration **0012** wraps its RPCs in a transaction sharing the existing per-user advisory lock, locks owned account rows, and checks exact account balances before commit. It rejects creating a negative balance or worsening an existing negative historical balance. Deleting income, moving money, debt repayment and Spend & Save must pass the same check; failures roll back ledger, targets, derived allocations and events together. Future-dated legacy money cannot fund current spending in this check.
- **Retries:** ledger creation accepts an optional UUID `requestId`; the entry form retains one per intent and a stable default date. The transaction reuses the existing owned `import_key` mechanism. Replays return the same row without retriggering effects; changed/deleted intents return a conflict. Legacy clients omitting the key keep ordinary create semantics. Native debt/expected-flow retry behavior remains unchanged.
- **Precision/reporting:** JS financial arithmetic uses integer kobo, PostgreSQL uses exact NUMERIC, and API amounts remain decimal strings until storage/display boundaries. Summary DTO numeric fields are preserved for September charts; authoritative exact values are additionally available in `summary.exact`. Reports paginate beyond PostgREST limits, exclude tombstones, account for opening balances/releases and use saved timezones. Charts convert to numbers only after integer aggregation. Insights now uses NGN rather than the erroneous dollar label.
- **Other route audit:** 0006 linkage/check-in guards and lifecycle rules remain authoritative. Routine deletion refuses known linked goals and recommends the existing archive action instead of leaving a dangling link. 0007 dropped assignments are excluded from active September lists; completion events are not duplicated. The historical UI's overdue-completion restriction is retained. Assignment local deadlines use the saved timezone. 0008 timebox/focus/ritual tables are not accessed by September and their cascades remain unchanged. 0010 action triggers stay enabled; tests exercise them with the financial/check-in/completion writes. No gamification or October UI was imported. Unrelated coach preview 0011 is not required.

## Schema evidence and migration scope

The available read-only Supabase schema request was denied/unavailable; no administrative DATABASE_URL binding exists. **Actual installed live migrations are unverified.** Repository files are not installation evidence.

Disposable PostgreSQL tests apply historical 0000–0005, immutable snapshots 0006–0010 from commit `3863438`, then 0012. Supabase auth/storage plumbing is emulated locally; real RLS, authenticated roles and trigger/RPC SQL run in PostgreSQL. Snapshots and SHA-256 provenance are in `tests/fixtures/compat-schema/`; they are not added to the historical application migration runner.

0012 creates/replaces only two invoker functions and grants execution to authenticated users, denying anonymous execution. It changes no existing table, policy, trigger or user record. No Drizzle entity shape changes; operation/types are declared in the TypeScript compatibility service. Applying 0012 twice is tested. **No live migration has been applied.**

Do not run the historical migration runner against a newer database. On a separately verified isolated Supabase environment, inspect prerequisites and backups, then review/apply 0012 using the supported SQL workflow. Leave production unchanged. The compatibility RPC is additive; older clients can still invoke their original RPCs, so this is not a global replacement for every database client's write policy.

## Preview write gate and recovery

`SEPTEMBER_COMPAT_DATABASE_VERIFIED=false` is declared in `.env.example`. Until an operator verifies an isolated database, **every financial mutation returns 503**. Production Vercel environments remain blocked even if that flag is set. No real financial write tests should be performed on an unverified preview database. The flag is an operator gate, not proof of installed schema or an account-access credential.

Only after read-only target inspection, reconciliation review and installation of the required functions on an isolated target should preview-scoped credentials and the flag be configured. Existing target balances may already contain historical double credits; this change does not silently rewrite or reconcile them. Invalid/negative historical money, future postings, manually set target baselines, other database writers, legacy non-financial concurrency behavior and all live integrations require review before production readiness can be claimed.

Recovery: disable the preview write flag first. Keep the additive functions/data in place while reviewing the prior client; reverting to the unadapted September writer reintroduces double-credit risk. Removing the two new functions is optional only after no client uses them; never roll back existing protections or user records. No production rollback is performed here.

## API compatibility and intentional deviations

Existing GET `/api/wealth` retains `entries`, `targets`, `debts`, `expectedFlows`, `summary`; it adds `accounts` and `timezone`. GET `/api/finance` retains `targets` and the latest 20 active entries. POST entry responses remain ledger-row objects (201). Snake-case `type`/`flow_kind`, `target_id`, `account_id` and `destination_account_id` aliases normalize through strict validation; conflicting or unknown writable DB fields are rejected. Transfers require two explicit distinct owned accounts. Edits/restores require `expectedRevision` and `action: save|restore`; deletes require `expectedRevision`. No client may set tombstones, balances, import keys or captured savings rules directly. Error responses contain safe messages, never raw database SQL.

New POST `/api/finance/accounts` accepts only `{name,kind}` and creates an owned account with zero opening balance. Account selectors/add-account controls are confined to the pre-existing Wealth modal. Money strings, retry IDs and integer chart calculations are visually neutral. Today/Plan/page composition, horizontal navigation, CSS, backgrounds, theme provider and typography are byte-identical to September.

## Verification

Run from `crystrack/`:

```sh
npm ci
npm run check
npm run build
npm run test:september:db
npm run test:september:browser
```

The database suite launches only a disposable Docker PostgreSQL instance with no network and tmpfs data, and never reads a live connection string. It invokes actual API handlers through a thin SQL adapter, plus direct concurrency/security probes. CI also runs this suite. The browser suite requires the cloud-provided Playwright/Chromium plus existing esbuild/Tailwind tooling; no new application dependency was added. It mounts the actual historical components/ThemeProvider with explicit synthetic API/auth/weather fixtures. It checks desktop/mobile, both themes, form account validation and exact submitted decimal strings; captures are not live-user screenshots.

`npm run check` passes with the original three ESLint warnings in `environment-background.tsx` (hook dependencies and the historical image element); no errors or new warnings. The file is deliberately unchanged rather than suppressing checks or altering the approved background renderer.

Live hosted visual/authentication/API verification may remain blocked by the workspace's egress proxy. Environment-variable bindings, installed production schema and real authenticated workflows cannot be certified from fixture tests or deployment success alone.

Validated candidate: `npm ci` succeeded; `npm run check` passed **82 tests**, TypeScript and ESLint (three unchanged historical warnings); optimized build passed; **21 disposable PostgreSQL scenarios** passed. Browser checks passed for Today, Plan, Wealth, dark/light, mobile, auth-form rendering and the transfer modal. Review captures in `docs/screenshots/september-compatibility/`. The integration scenarios include actual HTTP handler code, contribution/release exactness, one activity event, generic legacy aliases, request replay conflicts, transfers, revisions, tombstones/undo, target locks, account overdrafts, derived savings, concurrent spends, rollback, RLS, existing record preservation, goal/assignment trigger effects, linked-routine protection, native debt/expected-flow contracts and repeat-safe 0012 installation.

An operator can use `docs/sql/september-compatibility-preflight.sql` for read-only target metadata inspection. It reports history-table locations, required columns, RLS status and RPC signatures/fingerprints without selecting user records. This script has not been run against a live environment; presence/signatures still do not establish complete migration history or data reconciliation. Review actual migration records and definitions with authorized access before enabling the write gate.

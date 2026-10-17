# Wealth 0009: SQL Editor installer

Use these smaller files instead of pasting the full migration. They contain the same SQL as `src/db/migrations/0009_wealth_suite.sql`; each function stays intact. Do not edit any legacy migration or drop existing tables. Migrations 0000–0008 must already be installed.

1. Run `ROLLBACK;` separately in SQL Editor to clear a failed transaction.
2. Run each file below, **in order**, using its complete contents in a fresh editor tab. Clear any text selection before Run. Each file ends with a successful `installation_step` result. Do not continue after an error.
3. Remove any generated `-- Added by Supabase` suffix. RLS is already included. `zone` and `NEW.account_id` are not tables.
4. Resume Wealth writes only after all eight files succeed and verification is green. Each step commits separately, so an incomplete sequence is not a finished installation.

- [01 — Tables, columns, RLS and backfill](01-foundation.sql)
- [02 — Complete wealth_guard function and its triggers](02-guard-and-triggers.sql)
- [03 — Spend & Save](03-spend-save.sql)
- [04 — Entry CRUD](04-entry-crud.sql)
- [05 — Statement import](05-statement-import.sql)
- [06 — Budget reallocation](06-budget-reallocation.sql)
- [07 — Bill payment and permissions](07-bill-payment-and-permissions.sql)
- [08 — Savings target protection](08-target-protection.sql)
- [09 — Read-only verification](09-verify.sql): all seven `installed` values and all six `rls_enabled` values must be `true`.

`ERROR 42883: function wealth_guard() does not exist` means a trigger statement resolved no such function in the active schema. Step 02 creates it in `public` before creating its triggers. Do not run a trigger statement alone. The original single-file migration also creates functions before triggers; these parts make that ordering explicit for manual execution.

The installer is tested on a fresh, isolated PostgreSQL database, followed by two runs of the original migration and the accounting/security integration tests. These files do not apply anything to your live Supabase project automatically.

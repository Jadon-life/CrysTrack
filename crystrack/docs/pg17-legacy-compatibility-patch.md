# Issue #82 compatibility patch — DEVELOPMENT ONLY

Fresh read-only hosted PG17.6 source identified `assignments.revision` already exists with three revision-zero rows and `money_entries.bill_id` already references the legacy `wealth_bills` table. Existing live project has zero money entry/bill rows but valuable task history.

This PR **does not change hosted data**. It adjusts local candidate migrations to avoid using the same physical columns for different meanings:

- 0016 keeps the pre-existing `assignments.revision`, installs default 1, normalizes only zero versions to 1 (a migration-time change requiring all old writers to be isolated) and applies the positive revision check; adds reminder_version separately. No assignment ID/user/status is removed.
- 0019 adds `money_entries.sep28_bill_id` for the *new* recurring-bill system and retains the legacy `money_entries.bill_id` and its existing FK to `wealth_bills`. New bill-payment guard, RPC, due list and paid evidence check exclusively the Sep28 association.
- 0015 and 0020 reject either legacy or new bill references in ordinary Crystal Shard provenance and CSV import.
- 0021 exact overview verifies the new paired occurrence FK through `sep28_bill_id`, without treating old existing `bill_id` references as malformed September payments.
- 0024 owner account export now declares both links distinctly. The older legacy `wealth_bills` table is not itself part of the September export data subset; do not claim this is a complete SQL backup.
- The regression suite explicitly prevents swapping the old bill FK for the new one or silently skipping revision-zero records.

**Remaining before live personal release:** this source-level compatibility patch has not been run against an isolated clone of the actual hosted PG17 catalog with six managed event triggers. The existing cron and old web client writers need coordinated isolation, finance/RLS/trigger owner gates need review, and the user has skipped privately verified backup/restore. Source validation or synthetic local PG15 tests **cannot** certify a live PG17 one-way DDL migration is reversible or safe.

Do not install any partial numbered migrations into production until the exact compatibility changes, local tests, validated main artifact, and writer-gate cutover are reviewed together. No commercial-readiness work is prerequisite; these safeguards protect the user's existing personal records.
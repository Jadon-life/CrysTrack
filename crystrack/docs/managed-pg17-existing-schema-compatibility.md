# CrysTrack personal-use release: PG17 compatibility result (2026-10-21)

**Release decision: BLOCKED before any new SQL.** The user wants personal access, not commercial release, and explicitly prefers to skip their private backup. No hosted database write, migration, project pause or production deployment was performed in this check.

A fresh read-only live execution of `scripts/hosted-pg17-schema-collision-preflight.sql` against Supabase CrysTrack (project `yfzglhwjtpirbwhqatdx`, PG17.6) produced the following **nonidentifying aggregates**:

| Check | Actual result |
| --- | --- |
| September daily_records installed | No |
| Existing assignments.revision | Present; 3 existing rows have revision 0 |
| Source SQL 0016 | Would ADD assignments.revision with DEFAULT 1 and >0 requirement |
| Existing money_entries.bill_id | Present with FK to **legacy wealth_bills** |
| Source SQL 0019 | Would ADD money_entries.bill_id with FK to **new wealth_recurring_bills** |
| Legacy bill rows / linked money entries | 0 / 0, but existing schema and old routes still depend on its identity |
| Production cron | 1 active: crystrack-reminder-dispatch |
| Managed PG17 event triggers | 6 |
| Owner data still hosted | 3 accounts, 16 recurring tasks, 408 task occurrences, 3 assignments and 2 Storage objects |

**Why this cannot be a blind ALTER IF NOT EXISTS patch:** It would retain the wrong foreign-key target for Sep28 bill payment. The new bill RPCs, CSV source provenance, exact overview and owner account export all assume bill_id identifies a new wealth_recurring_bills row; the original legacy FK actually targets wealth_bills. The old three assignment revisions also remain 0 and fail the new >0 revision and optimistic-write semantics even if the ADD COLUMN is skipped.

A safe, source-reviewed compatibility design must: (a) preserve the original bill FK as a distinct legacy provenance relationship, (b) use a separate Sep28 bill association, updating the new bill-payment, CSV, exact overview, export and all affected test fixtures together, (c) migrate the existing assignment version 0 into a valid state with a proven old/new-client concurrency policy, and (d) prove PostgreSQL 17 compatibility against a disposable database containing these actual schema variants. It must also identify and isolate *all* previously deployed writers, existing cron and managed event hooks before the first migration, because 0013 changes legacy occurrence write guards immediately.

**Skipping a backup does not fix the incompatible schema.** Without an owner-held full data and Storage backup, failures cannot be reliably reversed; applying one of 0013–0024 and stopping on 0016/0019 would leave existing production routes in an undefined partial state. No part of the current source-only GitHub merge guarantees the deployed DB can satisfy the new APIs.

**GitHub main and Vercel facts:** main at `cf57f086f25bd54c193fc818432484fe12c70d7a` already contains the corrected NGN/USD toggle and source-entry UX. Vercel production build hold is configured to prevent this incompatible source auto-deploying; synthetic Preview is available. Do not remove production hold, migrate or redirect aliases until the compatibility branch passes real data-shape and user isolation tests. This issue is #82; release gate #18 remains OPEN.

This plan does not demand commercial-launch polishing; it is the minimum required to keep a personal CrysTrack application consistent with its existing owner data.
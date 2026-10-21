# Issue #55 — full-application writer fence (synthetic-only experimental prototype)

Starting base: September dev branch after PR #54. This is disposable PostgreSQL 15 engineering evidence, **not** a deployable managed-Supabase maintenance script and **not** release authorization. No real Supabase, Vercel, Preview, production, or main-branch changes.

## Implementation

The existing Issue #19 barrier stays byte-identical and task-only. The Issue #53 app API stop also remains separate and off by default.

The new local candidate has an opt-in driver at scripts/all-write-barrier.mjs and SQL at release/all-write-barrier/install.sql. It uses the fixed Docker database and checked local marker of the existing synthetic database builder, plus a new release-only confirmation value (ISSUE55-NO-HOSTED) and CRYSTRACK_RELEASE_REHEARSAL=ISSUE55-SYNTHETIC-ONLY. Database/host/Docker overrides are rejected by the fixed driver.

It establishes a private control schema and an unconditional statement trigger denying INSERT, UPDATE, DELETE and TRUNCATE on every public application table and crystrack_* private receipt table. It uses ENABLE ALWAYS TRIGGER with PT503 and no JWT, GUC, username, owner identity or service-role exception. A separate local ddl_command_end event trigger attaches the guard to newly created tables as the exact unchanged migration candidate sequence 0013–0024 is applied. Every attach takes a bounded ACCESS EXCLUSIVE table lock. Existing task/reward/finance triggers and RLS are not changed.

The test seeds fictional task and exact 250010-kobo money records, freezes, checks direct and service-role denials, verifies newly created public/private tables are also guarded, steps through the SQL candidate migrations, checks per-step catalog coverage, injects a failed DDL transaction and proves its rollback, then unfreezes and checks synthetic financial and receipt writes can resume. **These are acceptance targets, not verified outcomes until the GitHub Actions job passes.**

Local CI command after starting the fixed synthetic Supabase container:

CRYSTRACK_RELEASE_REHEARSAL=ISSUE55-SYNTHETIC-ONLY node --test tests/all-write-barrier.integration.mjs

## Hard limitations

- The local candidate **refuses any existing event trigger**, so the previous observation of six managed PG17 event hooks is a decisive hosted compatibility blocker. There is intentionally no hosted installation command.
- Trigger-only maintenance does not stop already-running multi-request HTTP handlers, old immutable Vercel URLs, direct REST/RPC, other service-role workers, scheduled cron, Telegram/push messages already reserved or sent, and external providers. Traffic and outbound isolation must be independently verified.
- The guard targets application public and crystrack_* tables in the local model; Auth, Storage, provider side effects, partitioned/foreign tables and unseen live schema are NOT covered by this prototype.
- Real owner-held backup and independently verified private restore, hosted migration numbering/catalog and ACL/RLS preflight, PG17 compatibility, finance/writer ingress fencing and actual rollback/cutover rehearsal remain unverified.

**Issue #18 must remain OPEN.** No hosted read/write/SQL, production freeze, Preview activation, Vercel setting change, migration installation, deployment, merge into main or restoration of traffic is authorized by this work. Each owner-controlled operation requires separate explicit permission.
# Issue #55 — full-data local barrier prototype, NOT approved for hosting

This is a narrow synthetic PostgreSQL 15 rehearsal building on Issue #19's fixed, marker-protected `crystrack_release_rehearsal` database. It is **not a production installation plan** and must never be applied to hosted Supabase. The original task-only gate and exact 0013–0024 migration SQL remain unmodified.

## Mechanism

- `install.sql` refuses every database except a known local name, session user `postgres`, and the expected private synthetic marker. It refuses an existing same-name gate, creates a private schema with no API grants, and an unconditional PT503 statement trigger.
- `enable.sql` is designed to run inside one bounded local transaction and adds `ENABLE ALWAYS` statement guards across all ordinary public app tables and CrysTrack application-private (`crystrack_*`) tables. The same fixed local session adds a DDL event hook to attach guards to new tables before their CREATE transaction commits.
- `check_active()` asserts event-hook identity, every table guard's exact trigger function/operation flags and API schema privilege denial. `disable.sql` checks integrity before removing the hook and table triggers, then asserts complete cleanup.
- The extra integration test runs **after the unchanged candidate migrations have been rehearsed**, inside the existing guarded local Docker/Supabase suite. It activates the full-data gate, confirms a finance write fails with PT503, removes the gate and checks that the existing task-only gate and catalog/data fingerprints remain intact.
- New PR-scoped CI runs the actual Docker suite (including the previously verified recovery tests); it does not access hosted services or use secrets.

## Nonclaims and remaining P0 work

This first local prototype is neither a standalone managed PostgreSQL 17 safety proof nor a complete old-client/cron/worker cutoff. It currently requires further tests for all finance writer families, REST/RPC service-role paths, synthetic simultaneous old requests, integrity tampering, trigger churn and migration-created table behavior while active. The integration test currently enables the full-data guard **after** installing 0013–0024, not across each DDL step; that release sequence remains unproven. Managed PG17 platform event triggers and roles may interact differently. Auth and Storage schemas, old immutable deployment URLs, direct consumer clients, service-role tasks, external schedulers and outbound messages still require owner-held isolation. Real database backup + independent private restoration and explicit separate approvals are still mandatory. No hosted metadata, private data, Vercel settings, Preview, deployment or main were accessed.

**Decision: DEVELOPMENT DRAFT; parent #18 remains OPEN and production BLOCKED.**
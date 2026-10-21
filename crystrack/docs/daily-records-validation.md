# Issue #10 validation record

Branch: `feat/piece2c-durable-daily-records`; base:
`9e7ff2653998517ff0e00b92476ae07c10e29dfa`.

Executed in `crystrack/` on 2026-10-18:

| Check | Result |
|---|---|
| `npm run check` | Passed: 129 unit tests; TypeScript passed; ESLint zero errors and four pre-existing warnings in unchanged background/3D-switch files. |
| `npm run build` | Passed: optimized Next.js build, types, all 39 static pages and dynamic routes generated. Environment sanitized and configured only with fixed loopback local Supabase bindings; no hosted credentials used. |
| `npm run local:reset` | Passed: fresh synthetic Docker database; unchanged 0000–0005 plus final 0013. Final migration SHA-256 matches the local bootstrap hash ledger. No remote migration bookkeeping fabricated. |
| `npm run test:local:db` | Passed: 30 real local integration tests (19 durable-record tests plus 11 original sandbox tests), zero failed/skipped. Final run after clean reset: about 42 seconds. |
| `git diff --check` | Passed. |

The real database suite covers owner/anonymous denial, evidence/closure write
protection, authenticated Auth/PostgREST/RPC access, idempotent retry/reused-ID
conflict, optimistic revisions, concurrent completion/skip/closure, whole-transaction
rollback on activity failure, verified-empty versus unknown history, next-day
schedule changes and bounds, archive/hard-delete survival, bounded and lazy outage
recovery, pagination/revision pinning, legacy duplicate evidence, an actual
1,001-routine snapshot, 23/25-hour DST dates, recorded east/west timezone changes,
private note create/update/blank-clear/Unicode limits/concurrent conflicts, atomic
routine creation, and Piece 2A partial current/best semantics. The original sandbox
suite also exercises local Auth, REST, Storage and owner RLS. Finance fixture tables
remain empty; no financial fixture writes were performed.

Dependencies and lockfile unchanged. No CSS, scenic backgrounds, navigation,
Three.js switch or finance writers changed. Today/Tasks changes are request/date
wiring plus accurate deletion-retention confirmation/tooltip text, not a redesign.
No browser visual comparison was needed to validate this backend slice; browser
end-to-end UI interactions and hosted integrations have **not** been certified.

The private test clock is restored after the serial suite. An interrupted run
requires resetting this disposable local sandbox before using it for development.
This PostgreSQL 15 local validation does not establish hosted version/schema parity.
See the contract and migration inventory for release blockers and deliberate API
compatibility refinements. No hosted data access, SQL, migrations, environment
changes, deployment or merge occurred during implementation/testing.

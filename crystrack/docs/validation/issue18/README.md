# Issue #18 local rehearsal evidence — 2026-10-21

Base: `feat/crystrack-premium-sep28` at `d1519e59f8b06177b0ba68074a1b7e8621fc7f39`. Target: fixed loopback `crystrack-local-free` Docker stack and the separately marked `crystrack_release_rehearsal` database, all synthetic. Node 24.19.0, npm 11.9.0, PostgreSQL 15.8, Chromium 154.0.8037.57. No hosted Supabase, Vercel, production or private account records accessed.

| Local command / proof | Result |
|---|---|
| `npm run local:reset` | PASS; fixed local stack rebuilt and seeded; old 0000–0005 plus exact 0013–0024 only in the local ledger |
| `node scripts/rehearse-release-readiness.mjs --synthetic-local-only=ISSUE18-NO-HOSTED` | PASS before and after full DB suite; 12 ordered candidate SHA-256 values in [local-catalog.json](local-catalog.json), 25 RLS tables, 23 RPC grant checks, 8 protected triggers, occurrence/AI direct-write revocations |
| `npm run test:local:db` | PASS **174 tests**, zero failures/skips; retained daily/Crystal/assignment/week/finance/AI/offline/export integration |
| `CRYSTRACK_RELEASE_REHEARSAL=ISSUE19-SYNTHETIC-ONLY node --test tests/task-release-barrier.integration.mjs` | PASS **9 tests**, zero failures; old SQL/REST/routes, service role, stale and held writers, gate drift, pre-gate timeout, full 0013–0024 under freeze, injected 0013 and 0020 failures with transactional recovery, owner smoke after unfreeze |
| `node scripts/test-task-maintenance.mjs --synthetic-local-only=ISSUE19-NO-HOSTED` | PASS **70** task/daily/cron API method probes return 503 before auth; Auth page remains available |
| `npm run check` | PASS **280 tests**, TypeScript pass, ESLint zero errors and four existing UI warnings |
| `npm run build` | PASS, normal production build after synthetic Preview test |
| `CRYSTRACK_CHROMIUM_PATH=/usr/bin/chromium npm run test:preview` | PASS, 12 routes, inventoried write endpoints denied, zero external browser requests, absent synthetic flag fails closed |
| Focused ESLint on new and amended rehearsal files | PASS, zero warnings/errors |

Fault injection changes only in-memory SQL sent to the marked local rehearsal database. The 0013 attempt rolls back its daily tables and event-hook attachments. The 0020 attempt rolls back its CSV tables/ledger columns and leaves the previous Crystal Shards source function byte-identical before the unchanged file is applied. The database barrier stays active through every migration and its check succeeds after each file. Normal local integration then exercises the complete unfrozen schema. These proofs do **not** establish managed PostgreSQL 17 compatibility or a live cutover.

The local barrier is task-specific and allows legitimate finance events; it cannot substitute for isolation of all deployed finance writers. It also rejects managed event triggers absent from its fixture. A release requires owner-held backup with verified restoration, hosted catalog/history and role checks, old URL/worker/cron isolation, reviewed hosted maintenance adaptation and separate approvals as detailed in [the readiness checklist](../../release-readiness-0013-0024.md). **Verdict: BLOCKED.**

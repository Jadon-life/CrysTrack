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

## Independent continuation: synthetic backup/restore test added (execution pending)

The new `scripts/issue18-synthetic-backup-restore.mjs` is invoked **only** from the explicit fixed-local `tests/task-release-barrier.integration.mjs` run, after migrating unchanged candidates 0013–0024. It uses a fixed local Docker container and synthetic source, a temporary mode-0600 `pg_dump -Fc` archive, a separately created and identity-marked destination, and `pg_restore --single-transaction --exit-on-error`. It compares exact source/restored row counts, NGN decimals, RLS owner isolation, RPC source fingerprints, grants and enabled trigger counts. A missing archive and a deliberately truncated archive fail; restore targets are dropped only after their per-run ownership marker is verified. A SHA-256 and elapsed restore milliseconds are printed without customer data. The archive is removed, never committed.

**Important evidence boundary:** This review environment has no local Docker/PostgreSQL installation. The new real dump/restore test is **authored but not executed here**. The earlier nine barrier tests / 174 DB tests above are Codex's **pre-correction** local evidence; they do not count as this new test passing. GitHub `validate` and Preview CI also do not run this disposable DB rehearsal. To complete Phase 1 acceptance, execute locally:

```sh
cd crystrack
npm run local:start
CRYSTRACK_RELEASE_REHEARSAL=ISSUE19-SYNTHETIC-ONLY node --test tests/task-release-barrier.integration.mjs
```

The extra test must pass and emit a sanitized `Issue #18 synthetic restore` result with a checksum, nonzero archive size, duration, owner/foreign isolation and corrupted-archive rejection. Do not copy backup files or secrets to GitHub. The local restore deliberately shares the same local PostgreSQL cluster roles; it **does not** prove portable cluster globals, real Supabase Auth/Storage/provider backup, independent target infrastructure, managed PG17 behavior or a hosted restore. Production remains BLOCKED until owner-held private backup and independently verified isolated restore and the other Issue #18 gates are satisfied.

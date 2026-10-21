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

## Independently verified synthetic backup/restore (GitHub Actions PASS)

The new `scripts/issue18-synthetic-backup-restore.mjs` is invoked **only** from the explicit fixed-local `tests/task-release-barrier.integration.mjs` run, after migrating unchanged candidates 0013–0024. It uses a fixed local Docker container and synthetic source, a temporary mode-0600 `pg_dump -Fc` archive, a separately created and identity-marked destination, and `pg_restore --single-transaction --exit-on-error`. It compares exact source/restored row counts, NGN decimals, RLS owner isolation, RPC source fingerprints, grants and enabled trigger counts. A missing archive and a deliberately truncated archive fail; restore targets are dropped only after their per-run ownership marker is verified. A SHA-256 and elapsed restore milliseconds are printed without customer data. The archive is removed, never committed.

**Verified execution:** [GitHub Actions #39560292175](https://github.com/Jadon-life/CrysTrack/actions/runs/39560292175), source SHA `6975fe300bc264e61ff8075f02f1d291a112795b`, completed **SUCCESS**: **10/10** guarded synthetic barrier tests including the new real backup/restore. The actual log confirms PG15.8, 409,190-byte `pg_dump -Fc`, SHA-256 `7737c0e41b5385378e0b3a5417c2ba5d7b7fff40277c0ff0593923d61b565c79`, 1,004ms restoration, matching original/restored task/finance/Crystal/AI counts, exact NGN, granted RPCs, enabled triggers, owner-versus-foreign isolation, and rejection of missing/truncated archives. No dump, real data or credentials were committed. Regular exact-SHA [CrysTrack CI #39560292159](https://github.com/Jadon-life/CrysTrack/actions/runs/39560292159) also finished SUCCESS with **both** standard jobs. Local PG15 is NOT hosted PG17 proof. Reproduce this guard locally:

```sh
cd crystrack
npm run local:start
CRYSTRACK_RELEASE_REHEARSAL=ISSUE19-SYNTHETIC-ONLY node --test tests/task-release-barrier.integration.mjs
```

The test emitted a sanitized `Issue #18 synthetic restore` result. Non-identifying machine-readable evidence is in [synthetic-restore-result.json](synthetic-restore-result.json). Do not copy actual backup files or secrets to GitHub. The local restore deliberately shares the same local PostgreSQL cluster roles; it **does not** prove portable cluster globals, real Supabase Auth/Storage/provider backup, independent target infrastructure, managed PG17 behavior or a hosted restore. Production remains BLOCKED until owner-held private backup and independently verified isolated restore and the other Issue #18 gates are satisfied.

# Piece 2B-Free: local Supabase only (Issue #8)

## No hosted service or billing

This is a dedicated **local** Supabase CLI/Docker stack, not a Supabase project,
branch, production clone or hosted staging environment. No Supabase login, link,
management token, GitHub secret or Vercel credential is needed. Do not use
CrysLearn(APP-Dev), production credentials, a database dump, or real user data.
Never expose/forward these local ports to the internet.

Requirements: Node >=22, Python 3, Docker Engine/Desktop with a local Unix socket
at `/var/run/docker.sock`, and free disk/memory for Supabase's PostgreSQL image.
First setup downloads official CLI and Docker artifacts, which may be several GB.
The pinned CLI is 2.39.2; the Python installer checks the official SHA-256 manifest
over verified HTTPS before extracting only its binary. No checksum/TLS bypass.
PostgreSQL 15 is used for this local contract sandbox (not a claim of production
version parity); the PG17 image exceeded this workspace's Docker storage limit.
The stack uses the CLI's supported official Docker Hub mirror because public ECR
is blocked in this cloud environment. Tool versions are explicit, not `npx latest`.

From `crystrack/`:

```sh
npm ci
npm run local:install
# Only for cloud Docker using the vfs storage driver:
# npm run local:prepare-vfs
npm run local:start
npm run test:local:db
npm run check
npm run build
npm run local:dev
# When finished with the development server, stop it, then:
npm run local:stop
```

If the default npm cache is unwritable, use `npm ci --cache /tmp/crystrack-npm-cache`.
`local:stop` retains local volumes. `npm run local:reset` deliberately erases and
recreates **only this local stack's** schema/fixtures; do not use it for useful
personal data. Stop/restart retains the local data. Do not run resets/tests while
another process is using the stack.

The local development command binds Next to loopback, supplies the generated local
keys privately and blanks all declared hosted integration bindings. It does not
edit `.env.local` or inherit a hosted `DATABASE_URL`. Sign up using a synthetic
`example.invalid` address for local UI exploration; seeded A/B users have no saved
password. Mail goes to the local inbox only. Do not enter real personal data.

### Docker vfs storage workaround

This cloud daemon uses `vfs`, which duplicates every layer and exhausted disk while
pulling the many-layer official PostgreSQL images. `local:start` refuses that pull
when the PG15 image is not already cached. The optional `local:prepare-vfs` command
downloads pinned Crane 0.20.3 with official checksum verification, exports the
official linux/amd64 PG15 image pinned to its registry digest, and imports a
single-layer **local-only** copy. It verifies the preserved runtime configuration
and records source provenance as an image label. Only layer packaging changes;
it does not rebuild PostgreSQL or substitute an emulated Supabase database. No
image is pushed to a registry. It refuses to overwrite an existing cached image.
Docker Desktop/overlay2 users do not need this workaround. This is not production
image/version certification.

## Isolation and destructive-command safeguards

- A fixed project ID `crystrack-local-free`; dedicated Docker bridge network with
  loopback host-port binding. Script checks container labels, names and published
  ports before any SQL/reset. No hosted credentials or service targets are supplied.
  This bridge is not an outbound firewall: Docker's internal-only networks suppress
  published ports, which prevents CLI/Auth/REST access. Isolation relies on fixed
  local targets, synthetic data and removal of hosted bindings, not egress denial.
- Docker is pinned to the local Unix socket, ignoring remote contexts/hosts.
- Only fixed actions are accepted. **Every extra argument is rejected** before any
  subprocess: `--linked`, `--db-url`, `--project-id`, `--workdir`, and arbitrary commands
  are not forwarded. A linked `.temp/project-ref` causes refusal.
- Reset always invokes the CLI's `db reset --local --no-seed`; SQL only goes through
  `docker exec` into the checked local container. No remote URL is accepted.
- The CLI child receives a minimal environment without hosted Supabase keys, tokens,
  database URLs or account credentials. Never use raw `supabase link`, `db push`,
  `db pull`, hosted `db reset`, or the historical Drizzle commands in this workflow.
- Local keys and private CLI logs live under ignored `.local-supabase/`, with private
  file permissions. Never commit or paste them. Routine commands do not print keys.
- Supabase configuration has no hosted references, env-secret substitutions,
  third-party auth providers, SMTP credentials, AI services or outbound webhooks.

These are guardrails for the supported scripts, not a sandbox against someone who
deliberately changes the scripts/configuration or invokes Docker/CLI directly.

## Historical baseline, bookkeeping and bootstrap limits

Supabase CLI owns its auth/storage infrastructure. Its migration and seed runners
are disabled. The wrapper applies the **unchanged** application SQL files
`0000_initial.sql` through `0005_intelligence_layer.sql` in their existing order.
It sets `search_path=public,extensions` locally because Supabase installs UUID
helpers in `extensions` while historical SQL calls them unqualified.

A private `crystrack_local_control.applied` ledger records source hashes, not
fabricated Supabase/Drizzle migration versions. Start skips already applied files
and refuses hash drift. Historical scripts contain repairs/backfills; they run
against synthetic local data only. No remote schema is inferred or certified.
If bootstrap fails partway through a historical file, inspect the private local log
and explicitly reset local data after fixing the cause; do not blindly retry or
mark a partial file applied. Do not copy these files into a remote migration runner.

Only routines, schedules, occurrences and synthetic Auth/profile records are seeded.
No money, savings targets, debts, expected flows or production data are seeded.

## Durable daily-record experiment — NOT a release migration

`supabase/drafts/daily-records.sql` is applied **locally only** after the baseline,
in a separate `crystrack_daily_draft` schema, excluded from PostgREST and both
migration runners. Matching draft DTOs are alongside it. Application Drizzle
models, API behavior, UI and legacy type drift are deliberately unchanged.
In particular, 0002 adds `skipped` and location/reminder fields that are missing
from older Drizzle/DTO declarations. A later application integration must reconcile
those declarations alongside its reviewed migration inventory; this local sandbox
does not silently rewrite migration history or claim schema parity.

It prototypes:

- owner/date keys, stable saved timezone and local-midnight closure boundaries;
- immutable routine identities without cascades to mutable routine definitions;
- explicit outcomes, verified/incomplete evidence and version columns;
- deferred completeness checks to reject a verified truncated snapshot;
- frozen eligibility/timezone once verified and immutable closed facts;
- owner-only reads and notes CRUD, no direct authenticated snapshot writes;
- one private note per user/date with a 4,000-character limit.

It is **not a production-ready daily-record backend**. Schedule-version capture,
next-day schedule changes, authenticated atomic set-status RPCs, idempotency,
revision enforcement, timezone transitions, closure locking/retries and compatibility
with all existing writers still need implementation/review. The contract experiment
does not repair or certify historical records. A verified count is not proof of
eligibility provenance. Older history remains unknown; Shield remains disabled.

Approved policies from Issue #8: midnight close, frozen day eligibility, stable
saved timezone with explicit transitions. No new daily streak or notes UI is wired.

## Test interpretation

`npm test` includes script safety checks, the writer inventory and a synthetic
mock that executes the actual profile PUT handler in Preview mode. It demonstrates
the existing handler can write; it does not contact Vercel or Supabase.

`npm run test:local:db` is separate and **requires the local stack**. It uses real
Supabase Auth/REST/Storage and PostgreSQL roles/RLS, synthetic users only, draft
constraints/closure, deletion survival, owner isolation, notes and Piece 2A input.
It fails rather than silently skipping an unavailable stack. Tests leave synthetic
fixtures for inspection; local reset clears them. Successful local tests do not
make hosted Preview safe or prove any remote migration is installed.

See [Preview safety audit](preview-write-safety.md) for the hosted release blocker.

## Validation record — 2026-10-18

Executed in this cloud workspace with Node 24.19, CLI 2.39.2 and the verified
single-layer PostgreSQL 15 cache:

- Frozen-lockfile `npm ci`: passed; no dependencies or lockfile changed.
- `npm run check`: 123 tests passed, TypeScript passed, ESLint zero errors and four
  warnings in unchanged background/theme-switch files.
- `npm run build`: optimized production build passed.
- `npm run test:local:db`: all 11 real local integration scenarios passed, including
  Auth/REST/Storage and the SQL draft. Passed again after local reset and stop/start.
- Repeated start, local-only reset/reseed and retained-volume stop/restart passed.
- `local:dev` smoke: `/auth` returned 200; unauthenticated `/api/tasks` returned 401.
  Signal forwarding was verified to stop the local Next server.
- Loopback bindings and private key-file permissions were checked. Extra reset
  flags were rejected. No financial fixtures, hosted queries or remote writes.

The original many-layer Docker pulls failed under vfs; no passing claim relies
on those attempts. The successful tests used the documented verified cache.
Application source, original migrations, deployed settings and approved UI are
unchanged. Push and draft PR creation are held at the user's request until branch
auto-deployment is confirmed disabled; no commit marker is considered protection.

## Issue #10 extension

The explicit local bootstrap inventory now includes `0013_daily_records.sql` after
0000–0005. See [the inventory](daily-records-migration-inventory.md) and
[contract](daily-records-contract.md). The independent draft schema remains a
prototype, not an application migration. `npm run test:local:db` runs both the
original sandbox and durable-record suites serially against synthetic Docker
data. Tests temporarily replace a private clock and restore it; reset the local
sandbox if interrupted. No clock override is exposed to clients.

## Issue #15 HTTP conflict regression

The local bootstrap additionally applies `0014_daily_http_conflicts.sql` after
0013. It changes business-conflict SQLSTATEs to `PT409`; no data/table shapes,
grants, policies or financial behavior change. The database suite now exercises
stale revisions, request-ID reuse, a closed-day request, note conflicts, pagination
revision conflicts and timezone-boundary conflicts through real local HTTP RPCs
with bounded requests, followed by successful retries/undo to prove locks release.
The original SQL-only tests remain. Hosted use requires separate review; the
previous 0013-only cutover checklist is insufficient until 0014 is approved.

## Piece 4 assignment candidate (Issue #25)

The explicit local bootstrap inventory now also includes `0016_assignment_lifecycle.sql`
after approved 0013–0015 (ten files total including six historical files). This
candidate is for the disposable local sandbox only. Hosted numbering/compatibility
remains UNKNOWN; no hosted release is authorized. See [the lifecycle contract](piece4-assignments.md).
The local DB command includes assignment ownership, revisions, atomic source/event/
reminder/reward behavior and concurrency tests. With a sanitized normal build and
this stack running, `node scripts/test-assignments.mjs` runs the signed-in Chromium
workflow using new synthetic identities; it accepts no URL or target arguments.

## Piece 5 Week Grid candidate (Issue #26)

The explicit local bootstrap now adds `0017_task_week_grid.sql` after 0016:
eleven files total (0000–0005 and 0013–0017). This candidate adds an
owner-authorized bounded week read; no table, outcome or reward rule changes.
It remains local-only, with hosted compatibility/history UNKNOWN and Issue #18
still blocking release. The full local DB command includes Week Grid evidence,
schedule-version, timezone, 1,001-child pagination, RLS and race tests.

After building a sanitized normal artifact against the guarded local stack,
`node scripts/test-week-grid.mjs` exercises real signed-in Chromium with new
synthetic identities, blocked external browser transport, all five viewport
widths and scoped axe checks. Set `CRYSTRACK_CHROMIUM_PATH=/usr/bin/chromium`
when using the system browser; otherwise install Playwright's pinned browser.
It accepts no URL/database target. Screenshots and sanitized evidence go under
ignored `.preview-test/week-grid/`. Its optional `--baseline` captures the
pre-change Tasks view and is not a substitute for the full workflow.

Run existing `test-assignments.mjs`, `test-today-streak.mjs` and
`test-crystals.mjs` separately, not concurrently: these suites share the private
sandbox clock. `npm run test:preview` rebuilds the artifact for synthetic mode;
rebuild normal mode before running normal-mode browser scripts. Never run
`npm ci` concurrently with build/test commands.


## Piece 6A budget candidate (Issue #29)

The explicit bootstrap now includes `0018_wealth_monthly_budgets.sql` after 0017:
**twelve** files, 0000–0005 and 0013–0018. This adds only owner-scoped budget
limits, private retry receipts and isolated budget functions. No ledger data or
reward/source trigger changes. Hosted history/compatibility/numbering remain
UNKNOWN; Issue #18 remains the release gate. Do not apply this candidate remotely.

`npm run test:local:db` includes exact monthly aggregate, saved-zone/DST, 2,001+
entries, classification, table constraints, RLS/ACL, concurrency and immutable
finance/reward/daily-state comparisons. Tests retain synthetic immutable daily
facts/users until the next guarded local reset and clean their financial fixture
rows; do not delete protected history or weaken guards to clean test accounts.

After a sanitized normal build, run `node scripts/test-budgets.mjs` for signed-in
Chromium with synthetic local accounts and a fictional indicative FX quote. It
accepts no URL/database arguments. External browser traffic is blocked before
transport. Screenshots and sanitized evidence go to ignored `.preview-test/budgets/`.
Run it separately from all other DB/browser suites, which share private sandbox
clocks. Preview testing rebuilds a separate artifact; rebuild normal mode before
running signed-in workflows. The existing free setup and secret requirements are
unchanged.

# Issue #44 — Piece 8B review handoff

Draft PR: https://github.com/Jadon-life/CrysTrack/pull/49

Base `c2a1f6c1cb43aa39457263babda7efb3ad5df921` was verified against the actual
remote development branch and both successful jobs in post-merge Actions
39513905461 before implementation. Issue #44 and both follow-up comments were
read. No post-September main code was imported.

## Implemented scope

Settings → Privacy & Data → Your data offers category selection, an informational
count/size review and an explicit sensitive-file confirmation. The UTF-8 JSON v1
archive has owner, UTC snapshot/created times, saved scheduling zone, canonical
NGN decimal strings, selected/unselected categories, per-category and dataset
counts, SHA-256 checksums/byte lengths, field-projection provenance and explicit
exclusions. It is **not** an automatically restorable account backup.

See the [pre-coding coverage matrix](piece8b-export-coverage.md),
[format and limitations](piece8b-export-format.md),
[field allowlist](../src/lib/account-export/catalog.json) and
[native column types](../src/lib/account-export/column-types.json).

The server uses fresh `auth.getUser()` ownership, strict owner-free request input,
private/no-store attachment responses, origin checks and bounded cancellation.
One STABLE RLS RPC reads a consistent PostgreSQL statement snapshot in bounded
250-row pages, never a recent-100/2,000 fallback. The owner-only STABLE AI helper
applies current trusted consent-revision provenance without exposing private
requests or permitting writes. Auth/AI revision are rechecked before release;
the client verifies the complete document, checksums and current actor/consent
before offering a bounded in-memory download. Offline and failed/partial reads
never create a file. Privacy/account changes cancel pending UI work.

Technical credentials, push/Telegram secrets, opaque transport metadata,
polymorphic activity/reminder target IDs, generated AI insights, old/revoked/
unproven AI messages and unsynchronized device intents are excluded. User-entered
notes/chat are sensitive, selected content, not automatically redacted free text.
No archive is logged, cached in browser storage, sent to a model or stored as an
export job. Already-saved files cannot be retracted.

## Executed validation

All users, records, financial values and screenshots were synthetic, on the
fixed guarded local Docker/loopback Supabase stack. No hosted account or bank
statement was read. Signed-in browser runs were sequential to avoid clock races.

| Gate | Actual result | Evidence |
| --- | --- | --- |
| `npm run check` | 279 application tests passed; TypeScript passed; ESLint 0 errors and 4 unchanged baseline warnings | [check.log](validation/issue44/check.log) |
| Dedicated export unit/HTTP subset | 16 passed, included in 279 | [unit.log](validation/issue44/unit.log) |
| Clean `local:reset` then `test:local:db` | 174 passed, including 11 new export probes | [database.log](validation/issue44/database.log) |
| Separate local release-barrier rehearsal | 9 passed | [release-barrier.log](validation/issue44/release-barrier.log) |
| Task maintenance | 70 pre-auth method probes denied; ordinary auth remains available | [maintenance.log](validation/issue44/maintenance.log) |
| Synthetic local Preview | 12 routes, 44 conservatively inventoried POST/writer surfaces denied; no external requests, offline storage activation, Web Locks or runtime errors | [preview.log](validation/issue44/preview.log), [summary](validation/issue44/preview-result.json) |
| Normal production build | Passed | [build.log](validation/issue44/build.log) |
| Account export Chromium | Five widths × dark/light; 10 scoped axe scans, zero violations; exact private download/reopen/checksum verification | [summary](validation/issue44/account-export-result.json) |
| Retained Chromium | 13 retained suites passed (14 total including export) | [suite exits](validation/issue44/browser-results.json) |
| Protected source audit | 185 original source files and all 17 legacy SQL files unchanged | [hashes](validation/issue44/protected-source.json) |

The four pre-existing lint warnings are in background image/hooks and physical
switch ARIA code. No checks or rules were bypassed. Scoped automated axe checks
and executed keyboard workflows are evidence, not full WCAG or physical-device
certification.

The new database probes cover authenticated/anonymous/service-role ACLs, real
local Auth/PostgREST JWTs, two owners and foreign links, exact maximum money and
microsecond offsets, >2,005 ledger rows, >1,000 frozen routine records, archived/
deleted live routines, no-write fingerprints across source domains, AI OFF/
revocation/clear/current trusted messages, byte/row limits and default READ
COMMITTED statement-snapshot consistency during a concurrent commit. Existing
163 tests retain finance provenance, rewards, daily transactions, atomic replay
and both archive/delete concurrency orders.

The export browser fixture verifies **2,008 money entries and 1,388 frozen daily
rows**, including paid bill linkage, exact CSV provenance and non-null bill end
dates. Real physical theme-switch keyboard interaction, all five widths
(375/430/768/1280/1440), category-only export, full selected records, checksums,
current AI consent, local history clear, revocation, real disconnection, intercepted
401, cancellation and cross-origin denial are exercised. No raw archive contents
appear in screenshots or evidence; private synthetic download files remain
ignored/transient. Financial/daily/reward/AI fingerprints remain unchanged by
export operations.

Retained suites: offline atomic guard, Assignments, Today streak, Crystal Shards,
Week Grid, budgets, bills, CSV, money presentation, exact overview/timezones,
AI privacy, offline queue and Calm Today/Wealth combined keyboard journey. The
Calm comparison-account financial hashes match. A retained overview test now
freezes the bill clock with its report clock, fixing host-day dependence without
changing finance application code. A deleted-routine fixture checks every old
frozen ID remains, allowing the legitimate new Today snapshot created by the
existing delete protocol. The full rehearsal starts from clean synthetic data;
legacy zero-finance-fixture assertions are preserved.

## Migration and safety inventory

**Only new candidate:** `0024_private_account_export.sql`; local-only, applied in
the dedicated disposable stack. Two new STABLE read functions; no table, trigger,
source DML, source RLS change or existing function replacement. All 17 prior
migrations remain byte-identical. Types/contracts for the new RPC/format are in
`format.ts`, its explicit field registry and native type map; no source table
schema or existing financial interface changed.

Hosted migration history, compatibility and rollout remain **UNKNOWN / NOT
ASSESSED**, because hosted queries and changes are forbidden. No hosted SQL,
Vercel setting, Preview activation, deployment, production, main or merge action
occurred. Issue #18 remains the hard release blocker. This candidate is not
permission to apply a hosted migration.

## Reproduction and review boundary

From `crystrack/`, with only the documented disposable synthetic local stack:

```sh
npm run local:reset
npm run test:local:db
npm run check
CRYSTRACK_CHROMIUM_PATH=/usr/bin/chromium npm run test:preview
CRYSTRACK_CHROMIUM_PATH=/usr/bin/chromium node scripts/test-export-rehearsal.mjs
node scripts/audit-account-export.mjs
node scripts/generate-account-export.mjs --check
```

The rehearsal runner supplies private loopback-only keys without printing them,
blanks declared hosted bindings, builds normally and runs all 14 browser suites
serially. It never deploys or resets a database. `--browser-only` resumes an
already-normal artifact; `--calm-only` resumes the final combined journey with
local synthetic fixture preparation. The production label is child-process
runtime selection for localhost, not a deployment. Do not run resets alongside
other local test processes.

See [14 synthetic screenshots](screenshots/issue44/README.md). Final local/remote/
PR/Actions head agreement, clean status and both exact CI job results are recorded
on PR #49 after the evidence commit, avoiding a self-referential commit hash.

Limits remain explicit: 10,000 rows per dataset, 25,000 total, 8 MiB projected and
12 MiB document; a larger single dataset has no date-partition export in this
increment and fails instead of truncating. Malformed/dangling verified relations
can block the affected selection; no record repair is performed. No offline
export, restore, account deletion, storage-asset backup or external-provider
copy deletion is implemented. Chromium was executed; physical iOS/Android devices
and live production infrastructure remain unverified. Independent review is next.
